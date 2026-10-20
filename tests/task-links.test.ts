import {describe,it,expect} from 'vitest';
import {parseTasks,completeTaskText} from '../src/productivity';
describe('stable linked tasks and completion outcomes',()=>{
 it('keeps identity across unrelated line inserts and completion while distinguishing duplicates',()=>{
  const before=parseTasks('- [ ] Repasar\n- [ ] Repasar\n','Physics.md');
  const moved=parseTasks('# Heading\n\n- [x] Repasar ✅ 2026-10-20\n- [ ] Repasar\n','Physics.md');
  expect(before[0].id).toBe(moved[0].id);expect(before[1].id).toBe(moved[1].id);expect(before[0].id).not.toBe(before[1].id);
 });
 it('does not report completion when Tasks advances to an intermediate state',()=>{
  const source='- [ ] Repasar 🔁 every day';const task=parseTasks(source,'Physics.md')[0];
  expect(()=>completeTaskText(source,task,'2026-10-20',()=>'- [/] Repasar 🔁 every day')).toThrow(/complet|estado/i);
 });
});
