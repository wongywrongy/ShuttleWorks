import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionRecipes, interactionSections } from '../surface-interactions.mjs';

test('filtered books only record interactions for included routes', () => {
  assert.deepEqual(interactionRecipes('console', []), []);
  const recipes = interactionRecipes('entrant', [['Results draw · Singles full bracket', '/e/demo/draws/MS']]);
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].path, '/e/demo/draws/MS');
  assert.equal(recipes[0].steps.length, 4);
});
test('HTML offers controllable motion and a static frame for every action, including failures', () => {
  const html = interactionSections([{ref:'I01',viewport:'mobile',name:'Menu',ok:false,error:'missing control',videoBase64:'abc',frames:[{caption:'Before',url:'/demo',png:'xyz'},{caption:'After',url:'/demo',png:'xyz'}]}], text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'));
  assert.equal((html.match(/<section /g) ?? []).length, 2);
  assert.equal((html.match(/<video /g) ?? []).length, 1);
  assert.match(html, /controls preload="none"/);
  assert.doesNotMatch(html, /autoplay/);
  assert.match(html, /Incomplete: missing control/);
  assert.match(html, /PDF shows keyframes/);
});
