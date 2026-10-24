Flow header. In guided flows the SideNav is hidden and TopBar carries an exit + Stepper.
```jsx
<TopBar back={<IconButton icon="x" label="Exit" />} title="Northstar People" right={<Button size="sm">Save & exit</Button>}>
  <Stepper steps={['Add job','Match','Improve','Download']} current={1} />
</TopBar>
```
