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

export const uploadProfileImage = (file: File, token: string) => {
  const formData = new FormData();
  formData.append('profile_image', file);

  return axios.post(API_ENDPOINTS.auth.uploadProfileImage, formData, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};
