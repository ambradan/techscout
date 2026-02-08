/**
 * TechScout — Feed Sources Index
 *
 * Imports and registers all feed sources.
 * Import this file to ensure all sources are registered.
 */

// Tier 1 - High Signal
import './hacker-news';
import './github-trending';
import './npm-packages';
import './product-hunt';
import './yc-launches';

// Re-export the base for convenience
export * from '../base';
