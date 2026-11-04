-- Micro-viva (voice questions): one spoken answer per module, transcribed by
-- Muse Voice Transcribe and graded by Muse Spark against key points, or
-- self-marked when offline grading is unavailable. Audio is never stored;
-- only the transcript, score, feedback and self-mark are kept.
create table viva_result (
  id integer primary key,
  employee_id integer not null references employee on delete cascade,
  module text not null,
  status text not null check (status in ('graded', 'self', 'no_speech')),
  transcript text,
  score integer check (score is null or score between 0 and 3),
  feedback_sw text,
  feedback_en text,
  self_mark text check (self_mark is null or self_mark in ('good', 'learning')),
  secs integer,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index viva_result_employee on viva_result (employee_id, created_at);
