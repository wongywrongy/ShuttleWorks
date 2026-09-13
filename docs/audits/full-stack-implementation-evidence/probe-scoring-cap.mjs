import {build} from '/home/kyle/code/ShuttleWorks/node_modules/esbuild/lib/main.js';
import {createRequire} from 'node:module';
await build({entryPoints:['/home/kyle/code/ShuttleWorks/apps/console/src/components/control-plane/ResultEntryForm.tsx'],bundle:true,platform:'node',format:'cjs',outfile:'/tmp/sw-final-audit/result-entry-form.cjs'});
const require=createRequire(import.meta.url);
const {effectiveScoringRules,gameWinner,scoringRulesSentence}=require('/tmp/sw-final-audit/result-entry-form.cjs');
for (const pointCap of [null,25,35]) {
 const input={setsToWin:2,pointsPerSet:21,deuceEnabled:true,pointCap};
 const rules=effectiveScoringRules(input);
 console.log(JSON.stringify({input,rules,label:scoringRulesSentence(rules),winner_30_29:gameWinner(30,29,rules),winner_25_24:gameWinner(25,24,rules),score_31_exceeds_form_bound:31>rules.cap}));
}
