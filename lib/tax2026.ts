export type FilingStatus = "mfj" | "single" | "hoh" | "mfs";

type Bracket = [number, number];

const ordinaryBrackets: Record<FilingStatus, Bracket[]> = {
  mfj: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]],
  single: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]],
  hoh: [[17700, .10], [67450, .12], [105700, .22], [201750, .24], [256200, .32], [640600, .35], [Infinity, .37]],
  mfs: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [384350, .35], [Infinity, .37]],
};

const standardDeduction: Record<FilingStatus, number> = {
  mfj: 32200,
  single: 16100,
  hoh: 24150,
  mfs: 16100,
};

const capitalGainThresholds: Record<FilingStatus, [number, number]> = {
  mfj: [98900, 613700],
  single: [49450, 545500],
  hoh: [66200, 579600],
  mfs: [49450, 306850],
};

const niitThreshold: Record<FilingStatus, number> = {
  mfj: 250000,
  single: 200000,
  hoh: 200000,
  mfs: 125000,
};

export const irmaaThresholds: Record<FilingStatus, number[]> = {
  mfj: [218000, 274000, 342000, 410000, 750000],
  single: [109000, 137000, 171000, 205000, 500000],
  hoh: [109000, 137000, 171000, 205000, 500000],
  mfs: [109000, 391000],
};

export const irmaaPartBSurcharges: Record<FilingStatus, number[]> = {
  mfj: [0, 81.2, 202.9, 324.6, 446.3, 487],
  single: [0, 81.2, 202.9, 324.6, 446.3, 487],
  hoh: [0, 81.2, 202.9, 324.6, 446.3, 487],
  mfs: [0, 446.3, 487.9],
};

const rmdDivisors: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
  79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8,
  85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4,
  97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6,
  103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9,
  109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
  115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

export type TaxInput = {
  filingStatus: FilingStatus;
  clientAge: number;
  partnerAge: number;
  ordinaryIncome: number;
  iraDistributions: number;
  rothConversion?: number;
  socialSecurity: number;
  longTermGains: number;
  netInvestmentIncome?: number;
};

function progressiveTax(income: number, brackets: Bracket[]) {
  let tax = 0;
  let floor = 0;
  for (const [ceiling, rate] of brackets) {
    tax += Math.max(0, Math.min(income, ceiling) - floor) * rate;
    if (income <= ceiling) break;
    floor = ceiling;
  }
  return tax;
}

function seniorDeductions(status: FilingStatus, clientAge: number, partnerAge: number, magi: number) {
  const eligible = (clientAge >= 65 ? 1 : 0) + (status === "mfj" && partnerAge >= 65 ? 1 : 0);
  if (!eligible) return 0;

  const existing = eligible * (status === "single" || status === "hoh" ? 2050 : 1650);
  if (status === "mfs") return existing;

  const phaseoutStart = status === "mfj" ? 150000 : 75000;
  const enhancedPerPerson = Math.max(0, 6000 - Math.max(0, magi - phaseoutStart) * .06);
  const enhanced = eligible * enhancedPerPerson;
  return existing + enhanced;
}

export function taxableSocialSecurity(benefits: number, otherIncome: number, status: FilingStatus) {
  if (!benefits) return 0;
  if (status === "mfs") return Math.min(benefits * .85, (otherIncome + benefits * .5) * .85);

  const base = status === "mfj" ? 32000 : 25000;
  const upper = status === "mfj" ? 44000 : 34000;
  const provisional = otherIncome + benefits * .5;
  if (provisional <= base) return 0;
  if (provisional <= upper) return Math.min(benefits * .5, (provisional - base) * .5);

  const baseTaxable = Math.min(benefits * .5, status === "mfj" ? 6000 : 4500);
  return Math.min(benefits * .85, baseTaxable + (provisional - upper) * .85);
}

export function calculateFederalTax(input: TaxInput) {
  const conversion = input.rothConversion ?? 0;
  const nonSocialIncome = input.ordinaryIncome + input.iraDistributions + conversion + input.longTermGains;
  const taxableSocial = taxableSocialSecurity(input.socialSecurity, nonSocialIncome, input.filingStatus);
  const ordinaryGross = input.ordinaryIncome + input.iraDistributions + conversion + taxableSocial;
  const magi = ordinaryGross + input.longTermGains;
  const deductions = standardDeduction[input.filingStatus] + seniorDeductions(
    input.filingStatus,
    input.clientAge,
    input.partnerAge,
    magi,
  );
  const taxableIncome = Math.max(0, ordinaryGross + input.longTermGains - deductions);
  const ordinaryTaxable = Math.max(0, taxableIncome - input.longTermGains);
  const taxableLongTermGains = Math.max(0, taxableIncome - ordinaryTaxable);
  const ordinaryTax = progressiveTax(ordinaryTaxable, ordinaryBrackets[input.filingStatus]);
  const [zeroCeiling, fifteenCeiling] = capitalGainThresholds[input.filingStatus];
  const zeroGain = Math.min(taxableLongTermGains, Math.max(0, zeroCeiling - ordinaryTaxable));
  const remainingGain = taxableLongTermGains - zeroGain;
  const fifteenGain = Math.min(remainingGain, Math.max(0, fifteenCeiling - ordinaryTaxable - zeroGain));
  const capitalGainTax = fifteenGain * .15 + Math.max(0, remainingGain - fifteenGain) * .20;
  const investmentIncome = input.netInvestmentIncome ?? input.longTermGains;
  const niit = Math.min(investmentIncome, Math.max(0, magi - niitThreshold[input.filingStatus])) * .038;

  let marginalRate = ordinaryBrackets[input.filingStatus][0][1];
  for (const [ceiling, rate] of ordinaryBrackets[input.filingStatus]) {
    marginalRate = rate;
    if (ordinaryTaxable <= ceiling) break;
  }

  return {
    federalTax: ordinaryTax + capitalGainTax + niit,
    ordinaryTax,
    capitalGainTax,
    niit,
    taxableSocial,
    taxableIncome,
    ordinaryTaxable,
    taxableLongTermGains,
    magi,
    deductions,
    marginalRate,
  };
}

export function estimateRmd(age: number, priorYearEndBalance: number, startAge: 73 | 75) {
  if (age < startAge || !priorYearEndBalance) return 0;
  const divisor = rmdDivisors[Math.min(120, Math.floor(age))];
  return divisor ? priorYearEndBalance / divisor : 0;
}

export function irmaaTier(magi: number, status: FilingStatus) {
  const thresholds = irmaaThresholds[status];
  let tier = 0;
  while (tier < thresholds.length && magi > thresholds[tier]) tier += 1;
  return tier;
}

export function socialSecurityFactor(claimAge: number, fullRetirementAge = 67) {
  const months = Math.round((claimAge - fullRetirementAge) * 12);
  if (months === 0) return 1;
  if (months > 0) return 1 + Math.min(months, 36) * (0.08 / 12);
  const earlyMonths = Math.abs(months);
  const first = Math.min(36, earlyMonths) * (5 / 9 / 100);
  const excess = Math.max(0, earlyMonths - 36) * (5 / 12 / 100);
  return 1 - first - excess;
}

export function bracketCeiling(status: FilingStatus, targetRate: number) {
  const bracket = ordinaryBrackets[status].find(([, rate]) => rate === targetRate);
  return bracket?.[0] ?? ordinaryBrackets[status][3][0];
}
