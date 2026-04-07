import express from 'express';
import { completeLesson } from './progress.controller.js';
import { isAuthenticated } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/complete', isAuthenticated, completeLesson);

export default router;
