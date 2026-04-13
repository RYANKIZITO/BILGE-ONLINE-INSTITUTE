// src/modules/payments/payment.controller.js
import { PaymentService } from './payment.service.js';
import { prisma } from '../../config/prisma.js';
import { enrollUser } from '../courses/course.service.js';
import { syncCourseStatusFromContent } from '../courses/course.status.js';
import { getCoursePriceForUser } from '../courses/course.pricing.js';
import { findPendingSwitchTopUpForCourse } from './switch-top-up.service.js';
import { notify } from '../../../services/notificationService.js';

const SAMPLE_STUDENT_EMAIL = (
  process.env.SAMPLE_STUDENT_EMAIL || 'salaam@test.com'
).toLowerCase();
const SAMPLE_STUDENT_ID = process.env.SAMPLE_STUDENT_ID || '';

const START_PROVIDER_METHOD = {
  stripe: 'card',
  pesapal: 'mobile_money',
  paypal: 'paypal'
};

const CONFIRM_PROVIDER_METHOD = {
  ...START_PROVIDER_METHOD
};

const isSampleStudent = (user) => {
  if (!user) return false;
  if (SAMPLE_STUDENT_ID && user.id === SAMPLE_STUDENT_ID) return true;
  if (user.email && user.email.toLowerCase() === SAMPLE_STUDENT_EMAIL) return true;
  return false;
};

const queueNotification = (payload) => {
  notify(payload).catch((error) => {
    console.error('[notifications] Failed to queue payment notification.', error);
  });
};

const queuePaymentFailedNotification = async ({
  reference,
  provider,
  user,
  course,
  amount,
  currency,
  failureReason
}) => {
  let payment = null;

  if (reference) {
    payment = await prisma.payment.findUnique({
      where: { reference },
      select: {
        id: true,
        amount: true,
        currency: true,
        provider: true,
        reference: true,
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            countryCode: true
          }
        },
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });
  }

  const notificationUser = payment?.user || user;

  if (!notificationUser) {
    return;
  }

  queueNotification({
    type: 'PAYMENT_FAILED',
    user: notificationUser,
    data: {
      paymentId: payment?.id || null,
      reference: payment?.reference || reference || null,
      provider: payment?.provider || provider || null,
      amount: payment?.amount ?? amount ?? null,
      currency: payment?.currency || currency || null,
      courseId: payment?.course?.id || course?.id || null,
      courseTitle: payment?.course?.title || course?.title || 'your programme',
      failureReason: failureReason || 'The payment could not be completed.'
    }
  });
};

const finalizeSwitchTopUpIfNeeded = async (payment) => {
  const purpose = payment?.metadata?.paymentPurpose;
  const cancellationId = payment?.metadata?.cancellationId;

  if (purpose !== 'SWITCH_TOP_UP' || !cancellationId) {
    return;
  }

  await prisma.enrollmentCancellation.update({
    where: { id: cancellationId },
    data: {
      refundReviewStatus: 'SWITCH_APPROVED',
      providerAdjustmentStatus: 'TOP_UP_PAID',
      providerAdjustmentReference: payment.reference,
      providerAdjustmentProcessedAt: new Date(),
      topUpPaymentId: payment.id
    }
  }).catch(() => {});
};

export const openSwitchTopUpPayment = async (req, res, next) => {
  try {
    const userId = req.session.user?.id;
    const cancellationId = req.params.id;

    if (!userId) {
      return res.redirect('/login');
    }

    const cancellation = await prisma.enrollmentCancellation.findFirst({
      where: {
        id: cancellationId,
        userId,
        refundReviewStatus: 'SWITCH_TOP_UP_REQUIRED'
      },
      include: {
        topUpPayment: true,
        requestedTargetCourse: {
          select: {
            title: true
          }
        }
      }
    });

    if (!cancellation || !cancellation.topUpPayment) {
      req.session.flash = {
        type: 'error',
        message: 'Top-up payment was not found for this switch request.'
      };
      return res.redirect('/my-courses');
    }

    if (cancellation.topUpPayment.status === 'SUCCESS') {
      req.session.flash = {
        type: 'info',
        message: 'This top-up payment has already been completed.'
      };
      return res.redirect('/my-courses');
    }

    const checkoutUrl =
      cancellation.topUpPayment.metadata?.checkoutUrl ||
      cancellation.topUpPayment.metadata?.redirectUrl ||
      null;

    if (!checkoutUrl) {
      req.session.flash = {
        type: 'error',
        message: `The checkout link for ${cancellation.requestedTargetCourse?.title || 'this switch request'} is no longer available.`
      };
      return res.redirect('/my-courses');
    }

    return res.redirect(checkoutUrl);
  } catch (err) {
    return next(err);
  }
};

export const payForCourse = async (req, res, next) => {
  try {
    const { provider, courseId } = req.body;
    const sessionUser = req.session.user;

    if (!sessionUser) {
      return res.redirect('/login');
    }

    if (!courseId) {
      return res.status(400).send('Missing courseId');
    }

    if (!START_PROVIDER_METHOD[provider]) {
      return res.status(400).send('Unsupported payment provider');
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        fullName: true,
        countryCode: true,
        phoneNumber: true,
        profileCompleted: true
      }
    });

    if (!dbUser) {
      return res.redirect('/login');
    }

    if (!dbUser.profileCompleted) {
      return res.redirect('/complete-profile');
    }

    const fullName = dbUser.fullName || dbUser.name;
    if (!dbUser.countryCode || !fullName || !dbUser.phoneNumber) {
      return res.status(400).send('Student profile is incomplete');
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        description: true,
        priceUgandanUsd: true,
        priceForeignUsd: true,
        currency: true,
        status: true,
        published: true
      }
    });

    if (!course || !course.published) {
      return res.status(404).send('Course not found');
    }

    const syncedStatus = await syncCourseStatusFromContent(course.id);
    const effectiveStatus = syncedStatus || course.status;

    if (effectiveStatus !== 'READY') {
      req.session.flash = {
        type: 'info',
        message: 'Enrollment opens when course is READY'
      };
      return res.redirect('/courses');
    }

    const pendingSwitchTopUp = await findPendingSwitchTopUpForCourse(
      dbUser.id,
      courseId
    );

    if (pendingSwitchTopUp) {
      if (!pendingSwitchTopUp.topUpPayment) {
        req.session.flash = {
          type: 'error',
          message: 'This approved programme switch is missing its top-up payment record. Please open My Courses and try again.'
        };
        return res.redirect('/my-courses');
      }

      return res.redirect(`/payments/switch-top-up/${pendingSwitchTopUp.id}`);
    }

    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: dbUser.id,
          courseId
        }
      }
    });

    if (existingEnrollment) {
      req.session.flash = { type: 'info', message: 'Already enrolled' };
      return res.redirect('/my-courses');
    }

    if (isSampleStudent(dbUser)) {
      try {
        await enrollUser(dbUser.id, courseId);
      } catch (err) {
        if (err?.code !== 'P2002') {
          throw err;
        }
      }
      return res.redirect('/my-courses');
    }

    const pricing = getCoursePriceForUser(course, dbUser);
    if (!pricing.pricingTier) {
      return res.status(400).send('Student country not set');
    }

    const amount = pricing.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).send('Invalid course price');
    }

    const currency = (course.currency || 'USD').toUpperCase();
    const paymentMethodType = START_PROVIDER_METHOD[provider];

    let payment;
    try {
      payment = await PaymentService.initiate(provider, {
        amount,
        currency: currency.toLowerCase(),
        metadata: {
          userId: dbUser.id,
          courseId,
          courseTitle: course.title,
          courseDescription: course.description,
          fullName,
          email: dbUser.email,
          phoneNumber: dbUser.phoneNumber,
          countryCode: dbUser.countryCode
        }
      });
    } catch (error) {
      await queuePaymentFailedNotification({
        provider,
        user: dbUser,
        course,
        amount,
        currency,
        failureReason: error.message || 'Payment provider is not available right now.'
      });

      req.session.flash = {
        type: 'error',
        message: error.message || 'Payment provider is not available right now.'
      };
      return res.redirect('/courses');
    }

    if (!payment?.checkoutUrl || !payment?.reference) {
      return res.status(400).send('Payment provider unavailable');
    }

    await prisma.payment.create({
      data: {
        userId: dbUser.id,
        courseId,
        amount,
        currency,
        provider,
        paymentMethodType,
        status: 'PENDING',
        reference: payment.reference,
        providerRef: payment.providerRef || payment.reference,
        metadata: payment.metadata || {}
      }
    });

    return res.redirect(payment.checkoutUrl);
  } catch (err) {
    return next(err);
  }
};

// payment verification callback
export const confirmPayment = async (req, res, next) => {
  try {
    const { provider, reference } = req.query;

    if (!provider || !reference) {
      return res.status(400).send('Missing payment reference');
    }

    if (!CONFIRM_PROVIDER_METHOD[provider]) {
      return res.status(400).send('Unsupported payment provider');
    }

    let verificationContext = { ...req.query };
    if (provider === 'paypal') {
      if (req.query.cancel === '1' || req.query.canceled === 'true') {
        await prisma.payment
          .update({
            where: { reference },
            data: { status: 'FAILED' }
          })
          .catch(() => {});
        await queuePaymentFailedNotification({
          reference,
          provider,
          failureReason: 'PayPal payment was cancelled.'
        });

        req.session.flash = {
          type: 'info',
          message: 'PayPal payment was cancelled.'
        };
        return res.redirect('/courses');
      }

      const existingPayment = await prisma.payment.findUnique({
        where: { reference },
        select: {
          providerRef: true,
          metadata: true
        }
      });

      verificationContext = {
        ...req.query,
        orderId:
          req.query.token ||
          req.query.orderId ||
          existingPayment?.providerRef ||
          existingPayment?.metadata?.orderId ||
          null,
        metadata: existingPayment?.metadata || {}
      };
    }

    if (provider === 'pesapal') {
      const existingPayment = await prisma.payment.findUnique({
        where: { reference },
        select: { metadata: true }
      });
      const existingTrackingId =
        existingPayment?.metadata?.orderTrackingId || null;
      const queryTrackingId =
        req.query.OrderTrackingId ||
        req.query.orderTrackingId ||
        req.query.order_tracking_id ||
        null;
      verificationContext = {
        ...req.query,
        orderTrackingId: queryTrackingId || existingTrackingId,
        metadata: existingPayment?.metadata || {}
      };
    }

    const valid = await PaymentService.verify(
      provider,
      reference,
      verificationContext
    );
    if (valid === null) {
      return res.status(202).send('Payment pending');
    }
    if (!valid) {
      await prisma.payment
        .update({
          where: { reference },
          data: { status: 'FAILED' }
        })
        .catch(() => {});
      await queuePaymentFailedNotification({
        reference,
        provider,
        failureReason: 'Payment verification failed.'
      });
      return res.status(400).send('Payment failed');
    }

    const paymentSnapshot = await prisma.payment.findUnique({
      where: { reference },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        provider: true,
        reference: true,
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            countryCode: true
          }
        },
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    const payment = await prisma.payment.update({
      where: { reference },
      data: {
        status: 'SUCCESS',
        verifiedAt: new Date(),
        providerRef:
          provider === 'paypal'
            ? verificationContext.orderId || undefined
            : undefined,
        metadata:
          provider === 'paypal'
            ? {
                ...(verificationContext.metadata || {}),
                orderId: verificationContext.orderId || null
              }
            : undefined
      }
    });

    try {
      await enrollUser(payment.userId, payment.courseId);
    } catch (err) {
      if (err?.code !== 'P2002') {
        throw err;
      }
    }

    await finalizeSwitchTopUpIfNeeded(payment);

    if (paymentSnapshot && paymentSnapshot.status !== 'SUCCESS' && paymentSnapshot.user) {
      queueNotification({
        type: 'PAYMENT_SUCCESS',
        user: paymentSnapshot.user,
        data: {
          paymentId: paymentSnapshot.id,
          reference: paymentSnapshot.reference,
          amount: paymentSnapshot.amount,
          currency: paymentSnapshot.currency,
          provider: paymentSnapshot.provider,
          courseId: paymentSnapshot.course?.id || null,
          courseTitle: paymentSnapshot.course?.title || 'your programme'
        }
      });
    }

    return res.redirect('/my-courses');
  } catch (err) {
    return next(err);
  }
};

export const handlePaymentWebhook = async (req, res, next) => {
  try {
    const { provider } = req.params;
    await PaymentService.webhook(provider, req.body);
    return res.status(200).send('OK');
  } catch (err) {
    return next(err);
  }
};

export const handlePesapalIpn = async (req, res, next) => {
  try {
    const payload = { ...req.query, ...req.body };
    const orderNotificationType =
      payload.OrderNotificationType ||
      payload.orderNotificationType ||
      payload.order_notification_type ||
      'IPNCHANGE';
    const orderTrackingId =
      payload.OrderTrackingId ||
      payload.orderTrackingId ||
      payload.order_tracking_id ||
      null;
    const reference =
      payload.OrderMerchantReference ||
      payload.merchant_reference ||
      payload.reference ||
      null;

    if (!reference && !orderTrackingId) {
      return res.status(400).send('Missing IPN identifiers');
    }

    let payment = null;
    if (reference) {
      payment = await prisma.payment.findUnique({
        where: { reference }
      });
    }

    if (!payment && orderTrackingId) {
      payment = await prisma.payment.findFirst({
        where: { providerRef: String(orderTrackingId) }
      });
    }

    if (!payment) {
      return res.status(404).send('Payment not found');
    }

    const sendAcknowledgement = (statusCode = 200) =>
      res.status(statusCode).json({
        orderNotificationType,
        orderTrackingId:
          orderTrackingId || payment?.metadata?.orderTrackingId || payment?.providerRef || '',
        orderMerchantReference: payment.reference,
        status: statusCode === 200 ? 200 : statusCode
      });

    const verificationContext = {
      orderTrackingId: orderTrackingId || payment?.metadata?.orderTrackingId,
      metadata: payment?.metadata || {}
    };

    const valid = await PaymentService.verify(
      'pesapal',
      payment.reference,
      verificationContext
    );

    if (valid === null) {
      return sendAcknowledgement(200);
    }

    if (!valid) {
      await prisma.payment
        .update({
          where: { reference: payment.reference },
          data: { status: 'FAILED' }
        })
        .catch(() => {});
      await queuePaymentFailedNotification({
        reference: payment.reference,
        provider: 'pesapal',
        failureReason: 'Pesapal reported the payment as unsuccessful.'
      });
      return sendAcknowledgement(200);
    }

    const updatedMetadata = {
      ...(payment.metadata || {}),
      orderTrackingId:
        orderTrackingId || payment?.metadata?.orderTrackingId || null
    };

    const paymentSnapshot = await prisma.payment.findUnique({
      where: { reference: payment.reference },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        provider: true,
        reference: true,
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            countryCode: true
          }
        },
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    const updatedPayment = await prisma.payment.update({
      where: { reference: payment.reference },
      data: {
        status: 'SUCCESS',
        verifiedAt: new Date(),
        providerRef: payment.providerRef || orderTrackingId || payment.providerRef,
        metadata: updatedMetadata
      }
    });

    try {
      await enrollUser(updatedPayment.userId, updatedPayment.courseId);
    } catch (err) {
      if (err?.code !== 'P2002') {
        throw err;
      }
    }

    await finalizeSwitchTopUpIfNeeded(updatedPayment);

    if (paymentSnapshot && paymentSnapshot.status !== 'SUCCESS' && paymentSnapshot.user) {
      queueNotification({
        type: 'PAYMENT_SUCCESS',
        user: paymentSnapshot.user,
        data: {
          paymentId: paymentSnapshot.id,
          reference: paymentSnapshot.reference,
          amount: paymentSnapshot.amount,
          currency: paymentSnapshot.currency,
          provider: paymentSnapshot.provider,
          courseId: paymentSnapshot.course?.id || null,
          courseTitle: paymentSnapshot.course?.title || 'your programme'
        }
      });
    }

    return sendAcknowledgement(200);
  } catch (err) {
    return next(err);
  }
};
