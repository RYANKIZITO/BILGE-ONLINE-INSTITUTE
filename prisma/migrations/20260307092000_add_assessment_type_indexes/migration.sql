-- Enforce only one MID_PROGRAMME per course
CREATE UNIQUE INDEX "Assessment_course_mid_programme_unique"
ON "Assessment" ("courseId")
WHERE ("type" = 'MID_PROGRAMME');

-- Enforce only one FINAL_CAPSTONE per course
CREATE UNIQUE INDEX "Assessment_course_final_capstone_unique"
ON "Assessment" ("courseId")
WHERE ("type" = 'FINAL_CAPSTONE');
