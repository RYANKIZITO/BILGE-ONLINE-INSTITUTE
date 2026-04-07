import {
  markLessonCompleted,
  checkCourseCompletion
} from './progress.service.js';

export const completeLesson = async (req, res) => {
  const userId = req.session.user.id;
  const { lessonId, courseId } = req.body;

  await markLessonCompleted(userId, lessonId);
  const completed = await checkCourseCompletion(userId, courseId);

  res.json({
    success: true,
    courseCompleted: completed
  });
};
