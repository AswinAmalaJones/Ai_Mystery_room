import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGeneratedCase } from '../dist/ai.js';

function validCase() {
  return {
    title: 'The Clocktower Cipher',
    briefing: 'A museum curator vanished before a gala.',
    incident: 'A locked display case is empty and the curator is missing.',
    timeline: [
      { timeLabel: '18:00', event: 'Guests arrive for the gala.' },
      { timeLabel: '18:30', event: 'The lights briefly fail.' },
      { timeLabel: '19:00', event: 'The empty case is discovered.' },
    ],
    suspects: [
      { id: 'alex', name: 'Alex Reed', role: 'Curator', profile: 'Careful and private.', statement: 'I was cataloguing artifacts.' },
      { id: 'blair', name: 'Blair Stone', role: 'Donor', profile: 'A demanding collector.', statement: 'I never left the ballroom.' },
      { id: 'casey', name: 'Casey Vale', role: 'Guard', profile: 'A diligent guard.', statement: 'The corridor was clear.' },
      { id: 'devon', name: 'Devon Hale', role: 'Restorer', profile: 'An expert conservator.', statement: 'I was in the workshop.' },
    ],
    clues: [
      { id: 'clock-key', title: 'Clock Key', description: 'A key is hidden behind the clock.', source: 'Clocktower', relevance: 'It opens a service door.' },
      { id: 'mud', title: 'Mud Trail', description: 'Mud marks lead to the workshop.', source: 'Corridor', relevance: 'It places someone near the door.' },
      { id: 'ledger', title: 'Ledger', description: 'A ledger records an altered entry.', source: 'Office', relevance: 'It exposes the motive.' },
      { id: 'fiber', title: 'Blue Fiber', description: 'A fiber matches a work coat.', source: 'Display case', relevance: 'It identifies the method.' },
      { id: 'ticket', title: 'Train Ticket', description: 'A ticket was purchased for dawn.', source: 'Desk', relevance: 'It suggests a planned escape.' },
      { id: 'camera', title: 'Camera Gap', description: 'The camera was covered during the outage.', source: 'Security room', relevance: 'It confirms timing.' },
    ],
    solution: {
      culpritSuspectId: 'devon',
      motive: 'Devon needed to hide a forged restoration record.',
      method: 'Devon used the service door during the power outage.',
      explanation: 'The ledger and blue fiber connect Devon to the theft.',
      evidenceLinks: [
        { clueId: 'ledger', deduction: 'The altered entry links Devon to the forgery.' },
        { clueId: 'fiber', deduction: 'The fiber matches Devon’s work coat.' },
      ],
      redHerrings: [{ clueId: 'ticket', explanation: 'The ticket belonged to the curator.' }],
    },
    hints: [
      { level: 1, text: 'Compare the work materials with the display evidence.' },
      { level: 2, text: 'The restoration records deserve a closer look.' },
    ],
    requiredClueIds: ['ledger', 'fiber'],
  };
}

test('accepts a coherent standard mystery without exposing generation details', () => {
  const mystery = validateGeneratedCase(validCase(), 'standard');
  assert.equal(mystery.solution.culpritSuspectId, 'devon');
});

test('rejects generated cases with references to unknown clues', () => {
  const mystery = validCase();
  mystery.solution.evidenceLinks[0].clueId = 'unknown-clue';
  assert.throws(() => validateGeneratedCase(mystery, 'standard'), /inconsistent/);
});
