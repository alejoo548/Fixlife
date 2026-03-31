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
  `rol` enum('client','worker','admin','root') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'client',
  `profile_image` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login` datetime DEFAULT NULL,
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_token` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token_expires_at` datetime DEFAULT NULL,
  `pending_email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `pending_worker` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `users`
--

INSERT INTO `users` (`id_user`, `name`, `lastname`, `email`, `phone_number`, `password_hash`, `rol`, `profile_image`, `created_at`, `last_login`, `username`, `verification_token`, `token_expires_at`, `pending_email`, `is_active`, `pending_worker`) VALUES
(19, 'Pablo', 'Escobar', 'paescobar831@gmail.com', '978465453', '$2b$12$pe9DAzHVYRO0aMcc9YyyAOvK713kyBTcWWgbn5kDgMP94NFP79u6O', 'root', NULL, '2026-03-12 05:12:56', '2026-03-30 21:32:55', 'pabloski', NULL, NULL, NULL, 1, 0),
(22, 'Alejandro', 'Medrano', 'medranoalejandro418@gmail.com', '21548413', '$2b$12$UxQpv8jjQWDNeOUYJ1bFzeEZA57IoSF9vkTYvrHRVZe1D33QCTP4m', 'worker', NULL, '2026-03-13 17:43:53', '2026-03-27 21:52:27', NULL, NULL, NULL, NULL, 1, 0),
(24, 'Rafael', 'Hernandez', 'rafamoihernandez@gmail.com', '978465453', '$2b$12$xYQm/SgjAlOTe9MEUQbTY.Lo8sqxMegsRoPdwddI2uMokHdlahWgi', 'client', NULL, '2026-03-27 13:39:56', NULL, 'rafita', NULL, NULL, NULL, 1, 0);

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
    `is_verified` tinyint(1) NOT NULL DEFAULT '0',
    `latitude` decimal(10, 7) DEFAULT NULL,
    `longitude` decimal(10, 7) DEFAULT NULL,
    `coverage_km` decimal(6, 2) NOT NULL DEFAULT '8.00'
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
MODIFY `id_user` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=28;

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

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `services`
--

DROP TABLE IF EXISTS `services`;

CREATE TABLE `services` (
    `id_service` int NOT NULL AUTO_INCREMENT,
    `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    `icon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT '1',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_service`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_services`
--

DROP TABLE IF EXISTS `worker_services`;

CREATE TABLE `worker_services` (
    `id_worker_profile` int NOT NULL,
    `id_service` int NOT NULL,
    `years_experience` int DEFAULT NULL,
    `base_price` decimal(10, 2) DEFAULT NULL,
    PRIMARY KEY (
        `id_worker_profile`,
        `id_service`
    ),
    KEY `fk_ws_service` (`id_service`),
    CONSTRAINT `fk_ws_worker` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE,
    CONSTRAINT `fk_ws_service` FOREIGN KEY (`id_service`) REFERENCES `services` (`id_service`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
--
-- Estructura de tabla para la tabla `hero_slides`
--

DROP TABLE IF EXISTS `hero_slides`;

CREATE TABLE `hero_slides` (
  `id_slide` INT NOT NULL AUTO_INCREMENT,
  `sort_order` INT NOT NULL,
  `image_url` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tag` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` VARCHAR(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cta` VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_slide`),
  UNIQUE KEY `ux_hero_slides_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `hero_slides` (`id_slide`, `sort_order`, `image_url`, `tag`, `title`, `description`, `cta`, `updated_at`) VALUES
(1, 1, 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?q=80&w=2070&auto=format&fit=crop', 'PREMIUM', 'Home Experts', 'Find certified electricians, plumbers, and technicians ready to solve any problem.', 'Find Technician', '2026-03-08 18:00:00'),
(2, 2, 'https://images.unsplash.com/photo-1581578731117-10d52b43cc0a?q=80&w=2070&auto=format&fit=crop', 'RENOVATION', 'Transform Your Space', 'From a fresh coat of paint to complete remodels. Make your dream home a reality.', 'Get a Quote', '2026-03-08 18:00:00'),
(3, 3, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=2668&auto=format&fit=crop', 'CLEANING', 'Spotless Homes', 'Deep cleaning and regular maintenance services so you can enjoy your free time.', 'Book Cleaning', '2026-03-08 18:00:00');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_cards`
--

DROP TABLE IF EXISTS `service_cards`;

CREATE TABLE `service_cards` (
    `id_card` int NOT NULL AUTO_INCREMENT,
    `id_service` int NOT NULL,
    `image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `badge` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'POPULAR',
    `headline` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `summary` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `cta_label` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Learn More',
    `sort_order` int NOT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT '1',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_card`),
    KEY `idx_service_cards_service` (`id_service`),
    KEY `idx_service_cards_active_sort` (`is_active`, `sort_order`),
    CONSTRAINT `fk_service_cards_service` FOREIGN KEY (`id_service`) REFERENCES `services` (`id_service`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_requests`
--

DROP TABLE IF EXISTS `service_requests`;

CREATE TABLE `service_requests` (
    `id_request` int NOT NULL AUTO_INCREMENT,
    `id_user` int DEFAULT NULL,
    `id_service` int NOT NULL,
    `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `location_text` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `latitude` decimal(10, 7) DEFAULT NULL,
    `longitude` decimal(10, 7) DEFAULT NULL,
    `budget` decimal(10, 2) NOT NULL DEFAULT '0.00',
    `radius_km` decimal(6, 2) NOT NULL DEFAULT '8.00',
    `assigned_worker_profile` int DEFAULT NULL,
    `status` enum(
        'open',
        'assigned',
        'in_progress',
        'done',
        'cancelled'
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_request`),
    KEY `idx_service_requests_service` (`id_service`),
    KEY `idx_service_requests_status_created` (`status`, `created_at`),
    KEY `idx_service_requests_user` (`id_user`),
    KEY `idx_service_requests_assigned_worker` (`assigned_worker_profile`),
    CONSTRAINT `fk_service_requests_service` FOREIGN KEY (`id_service`) REFERENCES `services` (`id_service`) ON DELETE CASCADE,
    CONSTRAINT `fk_service_requests_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id_user`) ON DELETE SET NULL,
    CONSTRAINT `fk_service_requests_assigned_worker` FOREIGN KEY (`assigned_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_request_images`
--

DROP TABLE IF EXISTS `service_request_images`;

CREATE TABLE `service_request_images` (
    `id_image` int NOT NULL AUTO_INCREMENT,
    `id_request` int NOT NULL,
    `image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_image`),
    KEY `idx_service_request_images_request` (`id_request`),
    CONSTRAINT `fk_service_request_images_request` FOREIGN KEY (`id_request`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_request_workers`
--

DROP TABLE IF EXISTS `service_request_workers`;

CREATE TABLE `service_request_workers` (
    `id_request` int NOT NULL,
    `id_worker_profile` int NOT NULL,
    `distance_km` decimal(8, 3) DEFAULT NULL,
    `status` enum('new', 'accepted', 'rejected', 'expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
    `notified_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_request`, `id_worker_profile`),
    KEY `idx_service_request_workers_worker_status` (`id_worker_profile`, `status`, `notified_at`),
    KEY `idx_service_request_workers_request` (`id_request`),
    CONSTRAINT `fk_service_request_workers_request` FOREIGN KEY (`id_request`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE,
    CONSTRAINT `fk_service_request_workers_worker` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */
;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */
;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */
;
