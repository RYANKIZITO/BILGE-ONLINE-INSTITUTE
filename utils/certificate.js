import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const generateVerificationCode = () => {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
};

export const generateCertificatePDF = ({ name, course, code }) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  const fileName = `certificate-${code}.pdf`;
  const filePath = path.join(process.cwd(), 'public/certificates', fileName);

  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(26).text('Certificate of Completion', { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(16).text(`This certifies that`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(22).text(name, { align: 'center', underline: true });
  doc.moveDown();

  doc.fontSize(16).text(`has successfully completed the course`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(20).text(course, { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(12).text(`Verification Code: ${code}`, { align: 'center' });
  doc.text(`Verify at: https://yourlms.com/verify`, { align: 'center' });

  doc.end();

  return `/certificates/${fileName}`;
};
