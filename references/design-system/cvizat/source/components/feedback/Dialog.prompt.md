Modal with title, body, and right-aligned footer actions (primary last).
```jsx
<Dialog title="Also update your Base CV?" onClose={close}
  footer={<><Button onClick={close}>Only this job</Button><Button variant="primary">Update Base too</Button></>}>
  Your Base CV is what every new job starts from.
</Dialog>
```
