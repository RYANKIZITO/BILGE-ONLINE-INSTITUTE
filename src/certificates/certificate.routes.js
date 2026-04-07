import express from 'express';
import {
  myCertificates,
  verifyCertificate
} from './certificate.controller.js';
import { isAuthenticated } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Student certificates
router.get('/my-certificates', isAuthenticated, myCertificates);

// Public certificate verification
router.get('/verify', verifyCertificate);

export default router;
