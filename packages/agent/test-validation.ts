/**
 * Test script to verify argument validation in planner
 * 
 * Run with: pnpm tsx packages/agent/test-validation.ts
 */

import { registry } from './registry/registry.js';

// Test case 1: calendar.checkAvailability with WRONG args (what LLM generates)
console.log('\n=== Test 1: calendar.checkAvailability with WRONG args ===');
const wrongArgs1 = {
  start: '2025-11-03T10:00:00+01:00',
  end: '2025-11-03T18:00:00+01:00',
};

const tool1 = registry.get('calendar.checkAvailability');
if (tool1) {
  const result1 = tool1.in.safeParse(wrongArgs1);
  console.log('Input args:', wrongArgs1);
  console.log('Validation result:', result1.success ? 'PASS' : 'FAIL');
  if (!result1.success) {
    console.log('Errors:', result1.error.issues.map(e => `${e.path.join('.')}: ${e.message}`));
  } else {
    console.log('Parsed args:', result1.data);
  }
}

// Test case 2: calendar.checkAvailability with CORRECT args
console.log('\n=== Test 2: calendar.checkAvailability with CORRECT args ===');
const correctArgs1 = {
  startWindow: '2025-11-03T10:00:00+01:00',
  endWindow: '2025-11-03T18:00:00+01:00',
  durationMin: 15,
};

if (tool1) {
  const result2 = tool1.in.safeParse(correctArgs1);
  console.log('Input args:', correctArgs1);
  console.log('Validation result:', result2.success ? 'PASS' : 'FAIL');
  if (!result2.success) {
    console.log('Errors:', result2.error.issues.map(e => `${e.path.join('.')}: ${e.message}`));
  } else {
    console.log('Parsed args:', result2.data);
  }
}

// Test case 3: calendar.createEvent with mixed args
console.log('\n=== Test 3: calendar.createEvent with args ===');
const args3 = {
  title: 'Sync with Ha',
  start: '2025-11-03T10:00:00+01:00',
  end: '2025-11-03T10:15:00+01:00',
  attendees: ['ha.doanmanh@gmail.com'],
  notifyAttendees: true,
};

const tool3 = registry.get('calendar.createEvent');
if (tool3) {
  const result3 = tool3.in.safeParse(args3);
  console.log('Input args:', args3);
  console.log('Validation result:', result3.success ? 'PASS' : 'FAIL');
  if (!result3.success) {
    console.log('Errors:', result3.error.issues.map(e => `${e.path.join('.')}: ${e.message}`));
  } else {
    console.log('Parsed args:', result3.data);
  }
}

// Test case 4: Show all calendar tools and their required arguments
console.log('\n=== All Calendar Tools ===');
const allTools = registry.getSchemas();
const calendarTools = allTools.filter(t => t.name.startsWith('calendar.'));

calendarTools.forEach(tool => {
  console.log(`\n${tool.name}:`);
  console.log(`  Description: ${tool.description}`);
  console.log(`  Arguments:`, tool.args);
});

console.log('\n=== Test Complete ===\n');
