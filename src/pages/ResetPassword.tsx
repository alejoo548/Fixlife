import React from 'react';
import { useTranslation } from 'react-i18next';

const ResetPassword = () => {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t('passwordRecovery.actions.resetPassword')}</h1>
      {/* Component content will go here */}
    </div>
  );
};

export default ResetPassword;
