-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Servidor: mysql:3306
-- Tiempo de generación: 23-02-2026 a las 19:22:09
-- Versión del servidor: 8.0.45
-- Versión de PHP: 8.3.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";

START TRANSACTION;

SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */
;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */
;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */
;
/*!40101 SET NAMES utf8mb4 */
;

--
-- Base de datos: `fixlife_db`
--
CREATE DATABASE IF NOT EXISTS `fixlife_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

USE `fixlife_db`;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `users`
--

DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
    `id_user` int NOT NULL,
    `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `lastname` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `phone_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `rol` enum('client', 'worker', 'admin') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'client',
    `profile_image` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_login` datetime DEFAULT NULL,
    `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `verification_token` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `token_expires_at` datetime DEFAULT NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_portfolio`
--

DROP TABLE IF EXISTS `worker_portfolio`;

CREATE TABLE `worker_portfolio` (
    `id_photo` int NOT NULL,
    `id_worker_profile` int NOT NULL,
    `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
    `description` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_profiles`
--

DROP TABLE IF EXISTS `worker_profiles`;

CREATE TABLE `worker_profiles` (
    `id_worker_profile` int NOT NULL,
    `id_user` int NOT NULL,
    `bio` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    `banner_image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `dui_document` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `cert_document` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `is_verified` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
ADD PRIMARY KEY (`id_user`) USING BTREE,
ADD UNIQUE KEY `email` (`email`),
ADD UNIQUE KEY `ux_users_username` (`username`);

--
-- Indices de la tabla `worker_portfolio`
--
ALTER TABLE `worker_portfolio`
ADD PRIMARY KEY (`id_photo`),
ADD KEY `fk_portfolio_worker` (`id_worker_profile`);

--
-- Indices de la tabla `worker_profiles`
--
ALTER TABLE `worker_profiles`
ADD PRIMARY KEY (`id_worker_profile`),
ADD UNIQUE KEY `id_user` (`id_user`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
MODIFY `id_user` int NOT NULL AUTO_INCREMENT,
AUTO_INCREMENT = 7;

--
-- AUTO_INCREMENT de la tabla `worker_portfolio`
--
ALTER TABLE `worker_portfolio`
MODIFY `id_photo` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `worker_profiles`
--
ALTER TABLE `worker_profiles`
MODIFY `id_worker_profile` int NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `worker_portfolio`
--
ALTER TABLE `worker_portfolio`
ADD CONSTRAINT `fk_portfolio_worker` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE;

--
-- Filtros para la tabla `worker_profiles`
--
ALTER TABLE `worker_profiles`
ADD CONSTRAINT `fk_worker_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id_user`) ON DELETE CASCADE;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */
;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */
;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */
;