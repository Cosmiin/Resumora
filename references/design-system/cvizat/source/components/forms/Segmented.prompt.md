Switch between input modes or views.
```jsx
<Segmented fullWidth value={mode} onChange={setMode} options={[{value:'paste',label:'Paste',icon:'clipboard-paste'},{value:'type',label:'Type it in',icon:'pencil'},{value:'link',label:'Link',icon:'link'}]} />
```
Not for step navigation — use Stepper.
