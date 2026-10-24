Labelled input; `multiline` for job ads and answers. Soft sage fill turns white with a pine ring on focus.
```jsx
<Field label="Job title" icon="briefcase" placeholder="e.g. Business Systems Analyst" />
<Field label="Paste the job ad" multiline rows={8} maxLength={6000} hint="We only read what you paste." />
<Field label="Email" icon="mail" error="Add the full address — e.g. mara@example.com" />
<Field label="Experience" suffix="years" success="Matches your CV" />
```
Errors say what to do. Mark the optional fields, not the required ones.
