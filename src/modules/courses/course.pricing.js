const roundCurrencyAmount = (value) =>
  Math.round((Number(value) || 0) * 100) / 100;

export const SWITCH_FINANCIAL_DIRECTION = {
  NOT_APPLICABLE: "NOT_APPLICABLE",
  EVEN_TRANSFER: "EVEN_TRANSFER",
  TOP_UP_REQUIRED: "TOP_UP_REQUIRED",
  CREDIT_DUE: "CREDIT_DUE",
  MANUAL_REVIEW: "MANUAL_REVIEW",
};

export const resolvePricingTier = (user) => {
  const code = String(user?.countryCode || "").trim().toUpperCase();
  if (!code) return null;
  return code === "UG" ? "UGANDAN" : "FOREIGN";
};

export const getCoursePriceForPricingTier = (course, pricingTier) => {
  const amount =
    pricingTier === "UGANDAN"
      ? Number(course?.priceUgandanUsd)
      : pricingTier === "FOREIGN"
        ? Number(course?.priceForeignUsd)
        : null;

  return {
    pricingTier,
    amount: Number.isFinite(amount) ? roundCurrencyAmount(amount) : null,
    currency: String(course?.currency || "USD").trim().toUpperCase(),
  };
};

export const getCoursePriceForUser = (course, user) =>
  getCoursePriceForPricingTier(course, resolvePricingTier(user));

export const buildSwitchFinancialSummary = ({
  user,
  sourceCourse,
  targetCourse,
  payment,
  storedSummary,
} = {}) => {
  if (storedSummary?.direction && storedSummary.direction !== SWITCH_FINANCIAL_DIRECTION.NOT_APPLICABLE) {
    return {
      sourceCourseFee:
        storedSummary.sourceCourseFee == null
          ? null
          : roundCurrencyAmount(storedSummary.sourceCourseFee),
      targetCourseFee:
        storedSummary.targetCourseFee == null
          ? null
          : roundCurrencyAmount(storedSummary.targetCourseFee),
      transferAmount:
        storedSummary.transferAmount == null
          ? null
          : roundCurrencyAmount(storedSummary.transferAmount),
      balanceAmount:
        storedSummary.balanceAmount == null
          ? null
          : roundCurrencyAmount(storedSummary.balanceAmount),
      currency: String(storedSummary.currency || "USD").trim().toUpperCase(),
      direction: storedSummary.direction,
      pricingTier: storedSummary.pricingTier || null,
    };
  }

  if (!targetCourse) {
    return {
      sourceCourseFee: null,
      targetCourseFee: null,
      transferAmount: null,
      balanceAmount: null,
      currency: null,
      direction: SWITCH_FINANCIAL_DIRECTION.NOT_APPLICABLE,
      pricingTier: null,
    };
  }

  const pricingTier = resolvePricingTier(user);
  const sourcePrice = getCoursePriceForPricingTier(sourceCourse, pricingTier);
  const targetPrice = getCoursePriceForPricingTier(targetCourse, pricingTier);
  const transferAmount = payment ? roundCurrencyAmount(payment.amount) : 0;
  const transferCurrency = String(
    payment?.currency || targetPrice.currency || sourcePrice.currency || "USD"
  )
    .trim()
    .toUpperCase();

  if (!pricingTier || sourcePrice.amount === null || targetPrice.amount === null) {
    return {
      sourceCourseFee: sourcePrice.amount,
      targetCourseFee: targetPrice.amount,
      transferAmount,
      balanceAmount: null,
      currency: targetPrice.currency || transferCurrency,
      direction: SWITCH_FINANCIAL_DIRECTION.MANUAL_REVIEW,
      pricingTier,
    };
  }

  if (
    sourcePrice.currency !== targetPrice.currency ||
    transferCurrency !== targetPrice.currency
  ) {
    return {
      sourceCourseFee: sourcePrice.amount,
      targetCourseFee: targetPrice.amount,
      transferAmount,
      balanceAmount: null,
      currency: targetPrice.currency,
      direction: SWITCH_FINANCIAL_DIRECTION.MANUAL_REVIEW,
      pricingTier,
    };
  }

  const difference = roundCurrencyAmount(targetPrice.amount - transferAmount);
  let direction = SWITCH_FINANCIAL_DIRECTION.EVEN_TRANSFER;

  if (difference > 0) {
    direction = SWITCH_FINANCIAL_DIRECTION.TOP_UP_REQUIRED;
  } else if (difference < 0) {
    direction = SWITCH_FINANCIAL_DIRECTION.CREDIT_DUE;
  }

  return {
    sourceCourseFee: sourcePrice.amount,
    targetCourseFee: targetPrice.amount,
    transferAmount,
    balanceAmount: roundCurrencyAmount(Math.abs(difference)),
    currency: targetPrice.currency,
    direction,
    pricingTier,
  };
};
