-- Task 2C — Employment Fields Enhancement
-- worker_category        : FTE | CONTINGENT | CONTRACTOR — worker classification (separate axis from employment_type work arrangement)
-- employee_code          : HR-assigned business code (NOT a replacement for person_number / auto-generated identifier)
-- probation_months_granted: persists the approved duration in months so it survives after probation_end_date passes

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS worker_category          varchar(20),
  ADD COLUMN IF NOT EXISTS employee_code            varchar(50),
  ADD COLUMN IF NOT EXISTS probation_months_granted integer;
