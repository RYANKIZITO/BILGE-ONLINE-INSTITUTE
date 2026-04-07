import { PrismaClient } from "@prisma/client";
import { shouldRepairUploadedLessonVideo, transcodeLessonUploadToStream } from "../modules/videos/video-processing.service.js";

const prisma = new PrismaClient();

const main = async () => {
  const lessons = await prisma.lesson.findMany({
    where: {
      videoUrl: {
        startsWith: "/uploads/",
      },
    },
    select: {
      id: true,
      title: true,
      videoUrl: true,
    },
    orderBy: { createdAt: "asc" },
  });

  for (const lesson of lessons) {
    if (!shouldRepairUploadedLessonVideo(lesson.videoUrl)) {
      continue;
    }

    const processedVideo = await transcodeLessonUploadToStream(lesson.videoUrl, {
      force: true,
    });

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        videoUrl: processedVideo.videoUrl,
      },
    });

    console.log(
      `Processed lesson video: ${lesson.title} -> ${processedVideo.videoUrl}`
    );
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
