HTML CV preview. Single column, standard headings, machine-readable text.
```jsx
<CVDocument template="clar" name="Mara Ionescu" titles={['Business Systems Analyst']} contact="Cluj-Napoca · mara@example.com"
  sections={[{ title:'Experience', items:[{ heading:'Systems Analyst — BridgeWorks', dates:'2021 — Present', bullets:['…'] }] }]} />
```
Dates render at their real precision: "2021 — Present", never an invented month.
