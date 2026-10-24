Custom dropdown that matches the Field look — use for any pick-one list that doesn't fit as visible RadioGroup cards.
```jsx
<Select label="Șablon" defaultValue="clar" options={[
  { value:'clar', label:'Clar', icon:'type', description:'Serif, editorial, o coloană' },
  { value:'contur', label:'Contur', icon:'layout-template', description:'Sans, bandă de accent, o coloană' } ]} />
<Select label="Oraș" searchable placeholder="Alege orașul" searchPlaceholder="Caută…" emptyText="Niciun rezultat"
  options={[{ value:'bv', label:'Brașov', group:'Centru' }, { value:'cj', label:'Cluj-Napoca', group:'Nord-Vest' }]} />
```
- 2–4 options with explanations → prefer RadioGroup (visible). 5+ → Select. 8+ → `searchable`.
- Always offer an honest "Nu știu / Lună necunoscută" option where facts can be unknown.
- Menu flips upward near the bottom of the viewport; closes on outside click, Esc or Tab.
