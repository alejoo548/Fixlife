-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Servidor: mysql:3306
-- Tiempo de generación: 15-04-2026 a las 18:34:18
-- Versión del servidor: 8.0.45
-- Versión de PHP: 8.3.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `fixlife_db`
--
CREATE DATABASE IF NOT EXISTS `fixlife_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `fixlife_db`;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `admin_activity_log`
--

CREATE TABLE `admin_activity_log` (
  `id_activity` int NOT NULL,
  `id_admin` int NOT NULL,
  `action_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int DEFAULT NULL,
  `summary` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `admin_activity_log`
--

INSERT INTO `admin_activity_log` (`id_activity`, `id_admin`, `action_type`, `entity_type`, `entity_id`, `summary`, `metadata`, `created_at`) VALUES
(1, 19, 'upload', 'hero_slide', 15, 'Updated image for slide #15', NULL, '2026-03-27 20:06:50'),
(2, 19, 'role_change', 'user', 24, 'Changed role for \"Test Client\" to admin', '{\"from\":\"client\",\"to\":\"admin\"}', '2026-03-27 20:07:22'),
(3, 19, 'role_change', 'user', 24, 'Changed role for \"Test Client\" to client', '{\"from\":\"admin\",\"to\":\"client\"}', '2026-03-27 20:07:39'),
(4, 19, 'status_change', 'user', 22, 'Deactivated \"Test Worker\"', '{\"is_active\":0}', '2026-04-10 21:36:17'),
(5, 19, 'status_change', 'user', 22, 'Activated \"Test Worker\"', '{\"is_active\":1}', '2026-04-10 21:36:19');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `hero_slides`
--

CREATE TABLE `hero_slides` (
  `id_slide` int NOT NULL,
  `sort_order` int NOT NULL,
  `image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tag` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cta` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `hero_slides`
--

INSERT INTO `hero_slides` (`id_slide`, `sort_order`, `image_url`, `tag`, `title`, `description`, `cta`, `updated_at`) VALUES
(14, 1, 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?q=80&w=2070&auto=format&fit=crop', 'PREMIUM', 'Home Experts', 'Find certified electricians, plumbers, and technicians ready to solve any problem.', 'Find Technician', '2026-03-13 14:07:42'),
(15, 2, 'https://images.unsplash.com/photo-1581578731117-10d52b43cc0a?q=80&w=2070&auto=format&fit=crop', 'RENOVATION', 'Transform Your Space', 'From a fresh coat of paint to complete remodels. Make your dream home a reality.', 'Get a Quote', '2026-03-27 20:06:50'),
(16, 3, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=2668&auto=format&fit=crop', 'Home repairs and maintenance', 'Home repairs and maintenance', 'Deep repairing and regular maintenance services so you can enjoy your free time.', 'Book repair', '2026-03-13 14:07:42');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `services`
--

CREATE TABLE `services` (
  `id_service` int NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `icon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `services`
--

INSERT INTO `services` (`id_service`, `name`, `description`, `icon`, `is_active`, `created_at`) VALUES
(3, 'Carpentry', 'Custom woodwork, furniture repair, and door/window installations.', '🪚', 1, '2026-03-10 01:02:40'),
(4, 'Auto Mechanic', 'Vehicle diagnostics, maintenance, and mechanical repairs.', '🔧', 1, '2026-03-10 01:02:40'),
(5, 'Childcare / Babysitting', 'Safe and reliable care for children at home.', '🧸', 1, '2026-03-10 01:02:40'),
(6, 'Gardening', 'Lawn care, pruning, planting, and garden maintenance.', '🌿', 1, '2026-03-10 01:02:40'),
(7, 'Electrical Services', 'Wiring, outlets, lighting, and electrical troubleshooting.', '⚡', 1, '2026-03-10 01:02:40'),
(8, 'Plumbing', 'Leak repairs, pipe installation, and drain unclogging.', '🚰', 1, '2026-03-10 01:02:40'),
(9, 'House Painting', 'Interior and exterior painting with professional finishing.', '🎨', 1, '2026-03-10 01:02:40'),
(10, 'Masonry', 'Brickwork, concrete repairs, and structural improvements.', '🧱', 1, '2026-03-10 01:02:40'),
(11, 'Welding', 'Metal fabrication, repairs, and custom welding jobs.', '🔥', 1, '2026-03-10 01:02:40'),
(12, 'AC Installation & Repair', 'Air conditioner setup, maintenance, and cooling fixes.', '🔌', 1, '2026-03-10 01:02:40'),
(13, 'Refrigeration Repair', 'Repair and maintenance for refrigerators and cooling systems.', '🗄️', 1, '2026-03-10 01:02:40'),
(14, 'Locksmith Services', 'Lock installation, key duplication, and emergency unlocking.', '🔐', 1, '2026-03-10 01:02:40'),
(15, 'Drywall Installation', 'Drywall mounting, patching, and wall finishing.', '🧱', 1, '2026-03-10 01:02:40'),
(16, 'Home Cleaning', 'Deep cleaning and regular housekeeping services.', '🧹', 1, '2026-03-10 01:02:40'),
(17, 'Elderly Care', 'Companion and basic support care for seniors.', '🤝', 1, '2026-03-10 01:02:40'),
(18, 'Computer Technician', 'PC troubleshooting, software setup, and hardware repair.', '🌐', 1, '2026-03-10 01:02:40'),
(19, 'Security Camera Installation', 'CCTV setup, configuration, and basic monitoring guidance.', '🔎', 1, '2026-03-10 01:02:40'),
(20, 'Appliance Repair', 'Repair of washers, dryers, stoves, and home appliances.', '🔨', 1, '2026-03-10 01:02:40');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_cards`
--

CREATE TABLE `service_cards` (
  `id_card` int NOT NULL,
  `id_service` int NOT NULL,
  `image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `badge` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'POPULAR',
  `headline` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `summary` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cta_label` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Learn More',
  `sort_order` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `service_cards`
--

INSERT INTO `service_cards` (`id_card`, `id_service`, `image_url`, `badge`, `headline`, `summary`, `cta_label`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 3, 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?q=80&w=1400&auto=format&fit=crop', 'POPULAR', 'Carpentry', 'Custom woodwork, furniture repair, and door/window installations.', 'Learn More', 1, 1, '2026-03-10 02:07:34', '2026-03-13 14:09:23'),
(3, 5, 'https://images.unsplash.com/photo-1596464716127-f2a82984de30?q=80&w=1400&auto=format&fit=crop', 'POPULAR', 'Childcare / Babysitting', 'Safe and reliable care for children at home.', 'Learn More', 2, 1, '2026-03-10 02:07:34', '2026-03-13 14:11:05'),
(4, 9, 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?q=80&w=1400&auto=format&fit=crop', 'POPULAR', 'House Painting', 'Interior and exterior painting with clean, professional finishing.', 'Learn More', 3, 1, '2026-03-10 02:07:34', '2026-03-13 14:15:18'),
(6, 6, 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?q=80&w=1400&auto=format&fit=crop', 'POPULAR', 'Gardening', 'Lawn care, planting, pruning, and garden maintenance.', 'Learn More', 4, 1, '2026-03-13 14:17:52', '2026-03-13 14:17:52');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_requests`
--

CREATE TABLE `service_requests` (
  `id_request` int NOT NULL,
  `id_user` int DEFAULT NULL,
  `id_service` int NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_text` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `budget` decimal(10,2) NOT NULL DEFAULT '0.00',
  `radius_km` decimal(6,2) NOT NULL DEFAULT '8.00',
  `urgency_level` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard',
  `status` enum('open','pending','assigned','route_in_progress','arrived','start_pending','in_progress','finish_pending','payment_pending','paid','completion_pending','awaiting_confirmation','done','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `assigned_worker_profile` int DEFAULT NULL,
  `initial_budget` decimal(10,2) DEFAULT NULL,
  `final_budget` decimal(10,2) DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT NULL,
  `booking_type` enum('express','scheduled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'express',
  `scheduled_date` date DEFAULT NULL,
  `scheduled_time` time DEFAULT NULL,
  `scheduled_start_time` datetime DEFAULT NULL,
  `scheduled_end_time` datetime DEFAULT NULL,
  `worker_arrived_at` datetime DEFAULT NULL,
  `workflow_version` tinyint unsigned NOT NULL DEFAULT '1',
  `client_approved_at` datetime DEFAULT NULL,
  `route_started_at` datetime DEFAULT NULL,
  `work_started_at` datetime DEFAULT NULL,
  `work_finished_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `service_requests`
--

INSERT INTO `service_requests` (`id_request`, `id_user`, `id_service`, `description`, `location_text`, `latitude`, `longitude`, `budget`, `radius_km`, `status`, `created_at`, `updated_at`, `assigned_worker_profile`, `initial_budget`, `final_budget`, `assigned_at`) VALUES
(1, NULL, 8, 'Necesito reparar una fuga en la tuberia principal del patio', '14.6349,-90.5069', 14.6349000, -90.5069000, 75.00, 5.00, 'open', '2026-03-10 05:30:00', '2026-03-10 05:30:00', NULL, NULL, NULL, NULL),
(20, 24, 9, 'pekfwoefpowpojqwopd', '5a Calle Oriente, Barrio Belén, Santa Tecla, La Libertad Sur, La Libertad, 1501, El Salvador', 13.6775213, -89.2874814, 1.00, 8.00, 'pending', '2026-04-08 21:54:25', '2026-04-08 21:54:25', NULL, 1.00, NULL, NULL);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_request_chat_messages`
--

CREATE TABLE `service_request_chat_messages` (
  `id_message` int NOT NULL,
  `id_request` int NOT NULL,
  `sender_role` enum('client','worker') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_user` int NOT NULL,
  `id_worker_profile` int DEFAULT NULL,
  `message` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_request_images`
--

CREATE TABLE `service_request_images` (
  `id_image` int NOT NULL,
  `id_request` int NOT NULL,
  `image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `service_request_images`
--

INSERT INTO `service_request_images` (`id_image`, `id_request`, `image_url`, `created_at`) VALUES
(1, 1, 'problem_images-1773120600146-858148059.png', '2026-03-10 05:30:00'),
(20, 20, 'problem_images-1775685265635-710216502.jpg', '2026-04-08 21:54:25');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_request_payments`
--

CREATE TABLE `service_request_payments` (
  `id_payment` int NOT NULL,
  `id_request` int NOT NULL,
  `provider` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sandbox',
  `checkout_reference` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_payment_id` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `platform_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `worker_payout` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payment_status` enum('pending','paid','released','refunded','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `paid_at` timestamp NULL DEFAULT NULL,
  `released_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_request_ratings`
--

CREATE TABLE `service_request_ratings` (
  `id_rating` int NOT NULL,
  `id_request` int NOT NULL,
  `id_client_user` int NOT NULL,
  `id_worker_profile` int NOT NULL,
  `punctuality` tinyint NOT NULL,
  `quality` tinyint NOT NULL,
  `price_fairness` tinyint NOT NULL,
  `comment` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_request_workers`
--

CREATE TABLE `service_request_workers` (
  `id_request` int NOT NULL,
  `id_worker_profile` int NOT NULL,
  `distance_km` decimal(8,3) DEFAULT NULL,
  `status` enum('new','accepted','rejected','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
  `notified_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `proposed_budget` decimal(10,2) DEFAULT NULL,
  `counter_message` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `counter_status` enum('pending','accepted','declined') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `users`
--

CREATE TABLE `users` (
  `id_user` int NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lastname` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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

-- User seed data intentionally omitted from version control.

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_notifications`
--

CREATE TABLE `user_notifications` (
  `id_notification` int NOT NULL,
  `id_user` int NOT NULL,
  `event_type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tone` enum('info','success','warning') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `read_at` timestamp NULL DEFAULT NULL,
  `id_request` int DEFAULT NULL,
  `id_bonus_payout` int DEFAULT NULL,
  `action_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dedupe_key` varchar(140) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_saved_locations`
--

CREATE TABLE `user_saved_locations` (
  `id_saved_location` int NOT NULL,
  `id_user` int NOT NULL,
  `kind` enum('home','work','favorite','recent') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `last_used_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_bonus_payouts`
--

CREATE TABLE `worker_bonus_payouts` (
  `id_bonus_payout` int NOT NULL,
  `id_worker_profile` int NOT NULL,
  `source_request_id` int DEFAULT NULL,
  `cycle_key` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payout_key` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bonus_type` enum('commission','royalty') COLLATE utf8mb4_unicode_ci NOT NULL,
  `base_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `bonus_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payout_status` enum('scheduled','paid','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `scheduled_for` date NOT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_portfolio`
--

CREATE TABLE `worker_portfolio` (
  `id_photo` int NOT NULL,
  `id_worker_profile` int NOT NULL,
  `image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_profiles`
--

CREATE TABLE `worker_profiles` (
  `id_worker_profile` int NOT NULL,
  `id_user` int NOT NULL,
  `bio` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `banner_image` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dui_document` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cert_document` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_verified` tinyint(1) NOT NULL DEFAULT '0',
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `coverage_km` decimal(6,2) NOT NULL DEFAULT '8.00',
  `is_online` tinyint(1) NOT NULL DEFAULT '0',
  `last_seen_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `worker_profiles`
--

INSERT INTO `worker_profiles` (`id_worker_profile`, `id_user`, `bio`, `banner_image`, `dui_document`, `cert_document`, `is_verified`, `latitude`, `longitude`, `coverage_km`, `is_online`, `last_seen_at`) VALUES
(9, 22, NULL, NULL, 'dui_document-1773423876235-448887698.pdf', 'cert_document-1773423876472-475299338.png', 1, 13.6775467, -89.2874410, 8.00, 1, '2026-04-10 21:33:07');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_availabilities`
--

CREATE TABLE `worker_availabilities` (
  `id_availability` int NOT NULL,
  `id_worker_profile` int NOT NULL,
  `day_of_week` int NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_rewards_settings`
--

CREATE TABLE `worker_rewards_settings` (
  `id_settings` int NOT NULL,
  `trial_min_completed_jobs` int NOT NULL DEFAULT '3',
  `commission_rate` decimal(6,4) NOT NULL DEFAULT '0.0700',
  `royalty_rate` decimal(6,4) NOT NULL DEFAULT '0.0400',
  `royalty_min_jobs` int NOT NULL DEFAULT '8',
  `royalty_min_completion_rate` decimal(6,2) NOT NULL DEFAULT '85.00',
  `payout_weekday` tinyint NOT NULL DEFAULT '5',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `worker_rewards_settings`
--

INSERT INTO `worker_rewards_settings` (`id_settings`, `trial_min_completed_jobs`, `commission_rate`, `royalty_rate`, `royalty_min_jobs`, `royalty_min_completion_rate`, `payout_weekday`, `updated_at`) VALUES
(1, 3, 0.0700, 0.0400, 8, 85.00, 5, '2026-04-10 21:29:16');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `worker_services`
--

CREATE TABLE `worker_services` (
  `id_worker_profile` int NOT NULL,
  `id_service` int NOT NULL,
  `years_experience` int DEFAULT NULL,
  `base_price` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `worker_services`
--

INSERT INTO `worker_services` (`id_worker_profile`, `id_service`, `years_experience`, `base_price`) VALUES
(9, 3, NULL, NULL);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `admin_activity_log`
--
ALTER TABLE `admin_activity_log`
  ADD PRIMARY KEY (`id_activity`),
  ADD KEY `idx_admin_created` (`id_admin`,`created_at`),
  ADD KEY `idx_entity` (`entity_type`,`entity_id`);

--
-- Indices de la tabla `hero_slides`
--
ALTER TABLE `hero_slides`
  ADD PRIMARY KEY (`id_slide`),
  ADD UNIQUE KEY `ux_hero_slides_sort` (`sort_order`);

--
-- Indices de la tabla `services`
--
ALTER TABLE `services`
  ADD PRIMARY KEY (`id_service`);

--
-- Indices de la tabla `service_cards`
--
ALTER TABLE `service_cards`
  ADD PRIMARY KEY (`id_card`),
  ADD UNIQUE KEY `ux_service_cards_sort` (`sort_order`),
  ADD KEY `idx_service_cards_service` (`id_service`),
  ADD KEY `idx_service_cards_active_sort` (`is_active`,`sort_order`);

--
-- Indices de la tabla `service_requests`
--
ALTER TABLE `service_requests`
  ADD PRIMARY KEY (`id_request`),
  ADD KEY `idx_service_requests_service` (`id_service`),
  ADD KEY `idx_service_requests_status_created` (`status`,`created_at`),
  ADD KEY `idx_service_requests_user` (`id_user`),
  ADD KEY `idx_service_requests_assigned_worker` (`assigned_worker_profile`),
  ADD KEY `idx_scheduled_times` (`booking_type`,`status`,`scheduled_start_time`);

--
-- Indices de la tabla `service_request_chat_messages`
--
ALTER TABLE `service_request_chat_messages`
  ADD PRIMARY KEY (`id_message`),
  ADD KEY `idx_sr_chat_request_created` (`id_request`,`created_at`),
  ADD KEY `idx_sr_chat_sender` (`id_user`);

--
-- Indices de la tabla `service_request_images`
--
ALTER TABLE `service_request_images`
  ADD PRIMARY KEY (`id_image`),
  ADD KEY `idx_service_request_images_request` (`id_request`);

--
-- Indices de la tabla `service_request_payments`
--
ALTER TABLE `service_request_payments`
  ADD PRIMARY KEY (`id_payment`),
  ADD UNIQUE KEY `uniq_sr_payment_request` (`id_request`),
  ADD UNIQUE KEY `uniq_sr_payment_reference` (`checkout_reference`),
  ADD KEY `idx_sr_payment_status` (`payment_status`,`created_at`);

--
-- Indices de la tabla `service_request_ratings`
--
ALTER TABLE `service_request_ratings`
  ADD PRIMARY KEY (`id_rating`),
  ADD UNIQUE KEY `uniq_sr_rating_request` (`id_request`),
  ADD KEY `idx_sr_rating_worker` (`id_worker_profile`),
  ADD KEY `fk_sr_rating_client` (`id_client_user`);

--
-- Indices de la tabla `service_request_workers`
--
ALTER TABLE `service_request_workers`
  ADD PRIMARY KEY (`id_request`,`id_worker_profile`),
  ADD KEY `idx_service_request_workers_worker_status` (`id_worker_profile`,`status`,`notified_at`),
  ADD KEY `idx_service_request_workers_request` (`id_request`);

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id_user`) USING BTREE,
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `ux_users_username` (`username`);

--
-- Indices de la tabla `user_notifications`
--
ALTER TABLE `user_notifications`
  ADD PRIMARY KEY (`id_notification`),
  ADD UNIQUE KEY `uniq_notification_dedupe` (`dedupe_key`),
  ADD KEY `idx_notification_user_created` (`id_user`,`created_at` DESC),
  ADD KEY `idx_notification_user_read` (`id_user`,`is_read`,`created_at` DESC);

--
-- Indices de la tabla `user_saved_locations`
--
ALTER TABLE `user_saved_locations`
  ADD PRIMARY KEY (`id_saved_location`),
  ADD KEY `idx_user_saved_locations_user_kind` (`id_user`,`kind`),
  ADD KEY `idx_user_saved_locations_user_last_used` (`id_user`,`last_used_at`);

--
-- Indices de la tabla `worker_bonus_payouts`
--
ALTER TABLE `worker_bonus_payouts`
  ADD PRIMARY KEY (`id_bonus_payout`),
  ADD UNIQUE KEY `uniq_bonus_request_type` (`source_request_id`,`bonus_type`),
  ADD UNIQUE KEY `uniq_bonus_payout_key` (`payout_key`),
  ADD KEY `idx_bonus_worker_status_date` (`id_worker_profile`,`payout_status`,`scheduled_for`);

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
  ADD UNIQUE KEY `id_user` (`id_user`),
  ADD KEY `idx_worker_profiles_geo_verified` (`is_verified`,`latitude`,`longitude`),
  ADD KEY `idx_worker_profiles_geo_online` (`is_verified`,`is_online`,`latitude`,`longitude`);

--
-- Indices de la tabla `worker_availabilities`
--
ALTER TABLE `worker_availabilities`
  ADD PRIMARY KEY (`id_availability`),
  ADD UNIQUE KEY `uniq_worker_day_slot` (`id_worker_profile`,`day_of_week`,`start_time`,`end_time`),
  ADD KEY `idx_worker_availability_lookup` (`day_of_week`,`is_active`,`start_time`,`end_time`);

--
-- Indices de la tabla `worker_rewards_settings`
--
ALTER TABLE `worker_rewards_settings`
  ADD PRIMARY KEY (`id_settings`);

--
-- Indices de la tabla `worker_services`
--
ALTER TABLE `worker_services`
  ADD PRIMARY KEY (`id_worker_profile`,`id_service`),
  ADD KEY `idx_worker_services_service_profile` (`id_service`,`id_worker_profile`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `admin_activity_log`
--
ALTER TABLE `admin_activity_log`
  MODIFY `id_activity` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de la tabla `hero_slides`
--
ALTER TABLE `hero_slides`
  MODIFY `id_slide` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT de la tabla `services`
--
ALTER TABLE `services`
  MODIFY `id_service` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT de la tabla `service_cards`
--
ALTER TABLE `service_cards`
  MODIFY `id_card` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de la tabla `service_requests`
--
ALTER TABLE `service_requests`
  MODIFY `id_request` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT de la tabla `service_request_chat_messages`
--
ALTER TABLE `service_request_chat_messages`
  MODIFY `id_message` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de la tabla `service_request_images`
--
ALTER TABLE `service_request_images`
  MODIFY `id_image` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT de la tabla `service_request_payments`
--
ALTER TABLE `service_request_payments`
  MODIFY `id_payment` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `service_request_ratings`
--
ALTER TABLE `service_request_ratings`
  MODIFY `id_rating` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
  MODIFY `id_user` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=28;

--
-- AUTO_INCREMENT de la tabla `user_notifications`
--
ALTER TABLE `user_notifications`
  MODIFY `id_notification` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `user_saved_locations`
--
ALTER TABLE `user_saved_locations`
  MODIFY `id_saved_location` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `worker_bonus_payouts`
--
ALTER TABLE `worker_bonus_payouts`
  MODIFY `id_bonus_payout` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `worker_portfolio`
--
ALTER TABLE `worker_portfolio`
  MODIFY `id_photo` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT de la tabla `worker_profiles`
--
ALTER TABLE `worker_profiles`
  MODIFY `id_worker_profile` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT de la tabla `worker_availabilities`
--
ALTER TABLE `worker_availabilities`
  MODIFY `id_availability` int NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `service_cards`
--
ALTER TABLE `service_cards`
  ADD CONSTRAINT `fk_service_cards_service` FOREIGN KEY (`id_service`) REFERENCES `services` (`id_service`) ON DELETE CASCADE;

--
-- Filtros para la tabla `service_requests`
--
ALTER TABLE `service_requests`
  ADD CONSTRAINT `fk_service_requests_assigned_worker` FOREIGN KEY (`assigned_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_service_requests_service` FOREIGN KEY (`id_service`) REFERENCES `services` (`id_service`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_service_requests_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id_user`) ON DELETE SET NULL;

--
-- Filtros para la tabla `service_request_chat_messages`
--
ALTER TABLE `service_request_chat_messages`
  ADD CONSTRAINT `fk_sr_chat_request` FOREIGN KEY (`id_request`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_sr_chat_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id_user`) ON DELETE CASCADE;

--
-- Filtros para la tabla `service_request_images`
--
ALTER TABLE `service_request_images`
  ADD CONSTRAINT `fk_service_request_images_request` FOREIGN KEY (`id_request`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE;

--
-- Filtros para la tabla `service_request_payments`
--
ALTER TABLE `service_request_payments`
  ADD CONSTRAINT `fk_sr_payment_request` FOREIGN KEY (`id_request`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE;

--
-- Filtros para la tabla `service_request_ratings`
--
ALTER TABLE `service_request_ratings`
  ADD CONSTRAINT `fk_sr_rating_client` FOREIGN KEY (`id_client_user`) REFERENCES `users` (`id_user`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_sr_rating_request` FOREIGN KEY (`id_request`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_sr_rating_worker` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE;

--
-- Filtros para la tabla `service_request_workers`
--
ALTER TABLE `service_request_workers`
  ADD CONSTRAINT `fk_service_request_workers_request` FOREIGN KEY (`id_request`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_service_request_workers_worker` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE;

--
-- Filtros para la tabla `user_saved_locations`
--
ALTER TABLE `user_saved_locations`
  ADD CONSTRAINT `fk_user_saved_locations_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id_user`) ON DELETE CASCADE;

--
-- Filtros para la tabla `worker_bonus_payouts`
--
ALTER TABLE `worker_bonus_payouts`
  ADD CONSTRAINT `fk_bonus_request` FOREIGN KEY (`source_request_id`) REFERENCES `service_requests` (`id_request`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_bonus_worker_profile` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE;

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

--
-- Filtros para la tabla `worker_availabilities`
--
ALTER TABLE `worker_availabilities`
  ADD CONSTRAINT `fk_worker_availability_profile` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE;

--
-- Filtros para la tabla `worker_services`
--
ALTER TABLE `worker_services`
  ADD CONSTRAINT `fk_ws_service` FOREIGN KEY (`id_service`) REFERENCES `services` (`id_service`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ws_worker` FOREIGN KEY (`id_worker_profile`) REFERENCES `worker_profiles` (`id_worker_profile`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
