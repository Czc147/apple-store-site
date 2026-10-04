'use client';

import { useEffect } from 'react';
import { captureReferralCode } from '@/lib/referral-client';

export default function ReferralCapture() {
  useEffect(() => {
    captureReferralCode(window.location.search);
  }, []);
  return null;
}
