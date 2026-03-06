import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';

export const forgotPassword = (email: string) => {
  return axios.post(API_ENDPOINTS.auth.forgotPassword, { email });
};

export const resetPassword = (
  email: string,
  token: string,
  newPassword: string
) => {
  return axios.post(API_ENDPOINTS.auth.resetPassword, {
    email,
    token,
    newPassword,
  });
};

export const verifyResetToken = (
  email: string,
  token: string
) => {
  return axios.post(API_ENDPOINTS.auth.verifyResetToken, {
    email,
    token
  });
};