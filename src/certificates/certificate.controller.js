import { prisma } from '../../config/prisma.js';

export const myCertificates = async (req, res) => {
  if (!req.session?.user) {
    return res.redirect('/login');
  }

  const certificates = await prisma.certificate.findMany({
    where: { userId: req.session.user.id },
    include: { course: true },
    orderBy: { issuedAt: 'desc' }
  });

  res.render('student/certificates', { certificates });
};


// verifying certificate
export const verifyCertificate = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.render('verify', { valid: false });
  }

  const cert = await prisma.certificate.findUnique({
    where: { verificationCode: code },
    include: { user: true, course: true }
  });

  if (!cert) {
    return res.render('verify', { valid: false });
  }

  res.render('verify', { valid: true, cert });
};
