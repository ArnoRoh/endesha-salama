-- Retry-safe quiz results: the phone re-sends the same answered_at on retry,
-- so (employee, step, answered_at) identifies one answer event. A refresher
-- cycle answers the same step at a different time and is a new row.
create unique index quiz_result_event on quiz_result (employee_id, step, answered_at);
