#!/usr/bin/env tsx
/**
 * Test script to verify LLM factory is correctly configured
 */
import { createLLM } from './llm/factory.js';
import { loadLLMConfig, logLLMConfig } from './llm/config.js';

console.log('='.repeat(60));
console.log('Testing LLM Factory Configuration');
console.log('='.repeat(60));

// Load and log configuration
const config = loadLLMConfig();
logLLMConfig(config);

console.log('\n' + '='.repeat(60));
console.log('Creating LLM instance...');
console.log('='.repeat(60));

// Create LLM with verbose logging
const llm = createLLM(undefined, true);

console.log('\n✅ LLM instance created successfully!');
console.log('Type:', llm.constructor.name);
console.log('='.repeat(60));
