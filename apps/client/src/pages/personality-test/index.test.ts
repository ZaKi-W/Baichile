import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('personality question selection', () => {
  it('scopes the highlighted option to the question that was answered', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');
    expect(source).toContain("selection.value.questionId === quiz.currentQuestion.id");
    expect(source).toContain('selection.value = { questionId, optionId }');
    expect(source).toContain('selection.value = null;\n    const completedMode = quiz.advance()');
    expect(source).not.toContain(':key="quiz.currentQuestion.id"');
    expect(source).not.toContain("const selectedId = ref('')");
  });
});
