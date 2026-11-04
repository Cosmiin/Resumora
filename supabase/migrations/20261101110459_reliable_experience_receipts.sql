-- A lost acknowledgement must not downgrade or overwrite a completed result.
CREATE OR REPLACE FUNCTION app.finish_workspace_operation(p_id uuid,p_state text,p_result jsonb,p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();o app.career_operation_results;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 IF p_state NOT IN ('ready','unknown','failed') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 SELECT * INTO o FROM app.career_operation_results WHERE tenant_id=w AND id=p_id FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF o.state=p_state AND o.result IS NOT DISTINCT FROM p_result THEN RETURN app.workspace_operation_json(o);END IF;
 IF o.state='ready' AND p_state IN ('unknown','failed') THEN RETURN app.workspace_operation_json(o);END IF;
 IF o.state NOT IN ('processing','unknown') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH';END IF;
 UPDATE app.career_operation_results SET state=p_state,result=p_result WHERE tenant_id=w AND id=p_id RETURNING * INTO o;
 RETURN app.workspace_operation_json(o);
END $$;

-- A completed, validated point with no recoverable parent result can fail recovery after
-- the execution deadline, without changing provider accounting or starting another attempt.
-- True unknown/unfinished provider calls remain unknown. This read projection never writes.
CREATE OR REPLACE FUNCTION app.workspace_operation_json(o app.career_operation_results) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH hash AS (
  SELECT substr(encode(sha256(convert_to(o.id::text||':experience-point-0','UTF8')),'hex'),1,32) AS h
 ), stage AS (
  SELECT substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12) AS id FROM hash
 ), lost AS (
  SELECT o.state IN ('processing','unknown') AND o.created_at<now()-interval '2 minutes'
   AND o.input#>>'{experience,intent}'='point' AND o.result IS NULL
   AND EXISTS (SELECT 1 FROM app.ai_enhancement_attempts a CROSS JOIN stage
    WHERE a.tenant_id=o.tenant_id AND a.id IN (stage.id||'-primary',stage.id||'-fallback') AND a.result_data->>'status'='completed') AS yes
 )
 SELECT jsonb_build_object('id',o.id,'kind',o.kind,'input',o.input,
  'state',CASE WHEN coalesce(lost.yes,false) THEN 'failed' WHEN o.state='processing' AND o.created_at<now()-interval '2 minutes' THEN 'unknown' ELSE o.state END,
  'result',CASE WHEN coalesce(lost.yes,false) THEN '{"error":{"code":"AI_OUTPUT_INVALID","reason":"RESULT_NOT_SAVED"}}'::jsonb ELSE o.result END,
  'createdAt',o.created_at) FROM lost
$$;

-- Retire only proven legacy score-validation failures. Never infer failure from elapsed time
-- or retry a provider request. The successful rewrite was not retained by that old flow.
WITH legacy AS (
 SELECT id,tenant_id FROM app.career_operation_results
 WHERE state='unknown' AND kind='rewrite' AND input#>>'{experience,intent}'='point'
  AND created_at<now()-interval '2 minutes'
), stages AS (
 SELECT l.id AS parent_id,l.tenant_id,stage,
  substr(encode(sha256(convert_to(l.id::text||':experience-point-'||stage,'UTF8')),'hex'),1,32) AS h
 FROM legacy l CROSS JOIN (
  SELECT '0'::text AS stage UNION ALL
  SELECT phase||n::text FROM generate_series(0,31) n CROSS JOIN (VALUES('before-'),('after-')) phases(phase)
 ) names
), ids AS (
 SELECT parent_id,tenant_id,stage,
  (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid AS child_id FROM stages
)
UPDATE app.career_operation_results parent
SET state='failed',result='{"error":{"code":"AI_OUTPUT_INVALID","reason":"LEGACY_SCORE_FAILURE"}}'::jsonb
WHERE parent.id IN (SELECT id FROM legacy)
 AND EXISTS (
  SELECT 1 FROM ids JOIN app.ai_enhancement_attempts a ON a.tenant_id=ids.tenant_id AND a.operation_id=ids.child_id
  WHERE ids.parent_id=parent.id AND ids.stage='0' AND a.result_data->>'status'='completed'
 )
 AND EXISTS (
  SELECT 1 FROM ids JOIN app.ai_enhancement_attempts a ON a.tenant_id=ids.tenant_id AND a.operation_id=ids.child_id
  WHERE ids.parent_id=parent.id AND ids.stage<>'0'
   AND a.result_data->>'status'='failed' AND a.result_data->>'errorCode' IN ('OUTPUT_INVALID','OUTPUT_UNSUPPORTED')
 )
 AND NOT EXISTS (
  SELECT 1 FROM ids JOIN app.ai_enhancement_operations op ON op.tenant_id=ids.tenant_id AND op.id=ids.child_id
  LEFT JOIN app.ai_enhancement_attempts a ON a.tenant_id=op.tenant_id AND a.operation_id=op.id
  WHERE ids.parent_id=parent.id AND (a.result_data IS NULL OR a.result_data->>'status' IN ('started','unknown'))
 );
