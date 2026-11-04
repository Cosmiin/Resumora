import test from 'node:test';
import assert from 'node:assert/strict';
import * as stream from '../src/ai/chat-stream.ts';
const frame = (value) => `data: ${JSON.stringify(value)}\r\n\r\n`;
const part = (content, finish_reason=null) => ({id:'gen-test',model:'test',choices:[{index:0,delta:{content},finish_reason}]});
function response(text) {
  const bytes=new TextEncoder().encode(text);
  return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}));
}
test('chat streams decode split Unicode and JSON escapes, comments, and both usage frame shapes',async()=>{
  assert.equal(typeof stream.readChatStream,'function');
  for(const choices of [[],[{index:0,delta:{content:''},finish_reason:'stop'}]]) {
    const output=JSON.stringify({text:'Raportări „clare”\n- SQL',explanation:'Clear',factIds:['a']});
    const seen=[];
    const wire=': OPENROUTER PROCESSING\r\n\r\n'+[...output].map(c=>frame(part(c))).join('')+
      frame(part('', 'stop'))+frame({id:'gen-test',choices,usage:{prompt_tokens:8,completion_tokens:9,total_tokens:17}})+'data: [DONE]\r\n\r\n';
    const result=await stream.readChatStream(response(wire),262144,undefined,text=>seen.push(text));
    assert.equal(result.choices[0].message.content,output);assert.equal(result.usage.total_tokens,17);
    assert.ok(seen.length>2);assert.equal(seen.at(-1),'Raportări „clare”\n- SQL');assert.ok(!seen.some(t=>t.includes('factIds')));
  }
});
test('partial text, EOF, truncated output and embedded error cannot masquerade as a completed stream',async()=>{
  for(const wire of [frame(part('{"text":"Draft')),frame(part('{}','length'))+'data: [DONE]\n\n',frame({error:{message:'bad'}})+'data: [DONE]\n\n']) {
    await assert.rejects(stream.readChatStream(response(wire),262144),/STREAM|OUTPUT|PROVIDER/);
  }
});
test('stream byte bounds and cancellation apply to the full body',async()=>{
  await assert.rejects(stream.readChatStream(response(':'.repeat(200)),100),/LIMIT/);
  const abort=new AbortController();
  const read=stream.readChatStream(new Response(new ReadableStream({start(){}})),100,abort.signal);
  abort.abort();await assert.rejects(read,/STOP|abort/i);
});
