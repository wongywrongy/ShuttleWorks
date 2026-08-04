The workspace shell's navigation spine. Modules (Meet/Bracket/Operations/Display) are collapsible groups tagged ENG/SHR/OUT; the open module reveals its shared sub-pages. This is what makes the product read as modular — every module exposes the same archetype sub-pages.

```jsx
<WorkspaceSidebar
  modules={[
    { name:'Meet', role:'ENG', open:true, active:'Matches',
      pages:['Roster','Matches','Configuration'] },
    { name:'Operations', role:'SHR' },
    { name:'Display', role:'OUT' },
  ]}
  workspaceLinks={['Members','Sharing','Settings']}
/>
```
