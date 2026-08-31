// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyPersonPath, includesPerson } from '../public/assets/bracket-path.js';

describe('public bracket path emphasis', () => {
  it('lights every node and brace carrying the stable person id', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-person-ids="p1 p2"></div><div data-person-ids="p2"></div><div data-person-ids="p3"></div>';
    applyPersonPath(root, 'p2');
    expect(root.classList.contains('has-person-path')).toBe(true);
    expect([...root.querySelectorAll('.is-person-path')]).toHaveLength(2);
  });

  it('matches complete ids rather than substrings', () => {
    const node = document.createElement('div');
    node.dataset.personIds = 'person-10 person-2';
    expect(includesPerson(node, 'person-1')).toBe(false);
  });

  it('clears the route when no person is active', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="is-person-path" data-person-ids="p1"></div>';
    root.className = 'has-person-path';
    applyPersonPath(root, '');
    expect(root.className).toBe('');
    expect(root.querySelector('.is-person-path')).toBeNull();
  });
});
