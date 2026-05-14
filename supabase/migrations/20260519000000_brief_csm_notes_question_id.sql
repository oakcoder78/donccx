-- Add question_id to brief_csm_notes so notes can be scoped to a specific question
ALTER TABLE brief_csm_notes ADD COLUMN IF NOT EXISTS question_id text;
CREATE INDEX IF NOT EXISTS brief_csm_notes_question_id_idx ON brief_csm_notes(question_id);
