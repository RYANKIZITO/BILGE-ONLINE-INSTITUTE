import { prisma } from "../config/prisma.js";

const STUDENT_CODE_PREFIX = "BOI";
const STUDENT_CODE_WIDTH = 9;

const normalizeFirstName = (value) => {
  const firstName = String(value || "")
    .trim()
    .split(/\s+/)[0] || "student";

  const sanitized = firstName.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
  return sanitized || "student";
};

const parseStudentSequence = (studentCode) => {
  const match = String(studentCode || "").match(/^BOI\/(\d{9})\//);
  return match ? Number(match[1]) : 0;
};

const buildStudentCode = (sequence, name) =>
  `${STUDENT_CODE_PREFIX}/${String(sequence).padStart(STUDENT_CODE_WIDTH, "0")}/${normalizeFirstName(name)}`;

const getNextStudentSequence = async (db = prisma) => {
  const users = await db.user.findMany({
    where: {
      studentCode: {
        not: null,
      },
    },
    select: {
      studentCode: true,
    },
  });

  return users.reduce((max, user) => Math.max(max, parseStudentSequence(user.studentCode)), 0) + 1;
};

export const assignStudentCode = async (userId, name, db = prisma) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sequence = await getNextStudentSequence(db);
    const studentCode = buildStudentCode(sequence, name);

    try {
      return await db.user.update({
        where: { id: userId },
        data: { studentCode },
      });
    } catch (err) {
      if (err?.code !== "P2002") {
        throw err;
      }
    }
  }

  throw new Error("Unable to generate a unique student code.");
};
