import { describe, it, expect } from 'vitest';
import { add } from '../index';

describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 1)).toBe(2);
  });
});