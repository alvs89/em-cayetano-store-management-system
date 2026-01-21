# Web-Based Store Management System for E.M. Cayetano Trading

## Project Overview

This project is a dedicated management platform developed for **E.M. Cayetano Trading**. As part of our Software Engineering 1 requirements at the Technological Institute of the Philippines, we designed this system to transition the shop’s manual record-keeping into a digital, streamlined process.

The system acts as a "one-stop shop" for the business, allowing them to manage their inventory, track sales through reporting modules, and ensure that only authorized personnel can access sensitive business data.

## Purpose and Objectives

The primary goal was to create a tool that is both powerful enough to handle business data and simple enough for everyday use. Our main objectives were:

* **Centralization:** Moving away from scattered paper records and into a single digital database.
* **Security:** Implementing a multi-layered login process (including 2FA) to protect business information.
* **Efficiency:** Automating inventory tracking so the owners know exactly what is in stock without manual counting.
* **Reporting:** Providing a clear view of business performance through generated reports.

## How the System Works

The application follows a logical flow designed around the user's daily tasks:

1. **Authentication:** Users start at a secure login screen. For added security, we've included flows for "Forgot Password" and Two-Factor Authentication (2FA).
2. **The Dashboard:** Once logged in, the user sees a high-level overview of the system. From here, they can navigate to different specialized modules.
3. **Core Modules:** * **Inventory:** Where products are added, updated, or tracked.
* **User Management:** For controlling who has access to the system.
* **Reports:** A section dedicated to viewing data trends and business summaries.
* **Maintenance:** Tools for system backups and archiving old data to keep the system running fast.



## Technologies Used

We chose a modern tech stack to ensure the system is fast, responsive, and easy to maintain:

* **Frontend:** React v19 (JavaScript ES2024) – We used the latest version of React to take advantage of improved performance and cleaner component structures.
* **Backend:** Express.js v5.1.0 – Handles the logic and communication between the interface and the database.
* **Database:** PostgreSQL v18 – A reliable relational database used to store all product and user information securely.
* **Styling:** Tailwind CSS & Lucide Icons – Used to create a clean, professional-looking interface that works well on different screen sizes.

## Project Structure and Logic

In building this, we focused on a **Component-Based Architecture**. Instead of writing one giant file, we broke the system down into smaller, reusable pieces.

* **Routing (`App.jsx`):** This is the "brain" of our navigation. It decides which page to show based on the URL, ensuring that a user can't skip the login screen to get to the dashboard.
* **State Management (`DataContext.jsx`):** We used React's Context API to allow information (like user roles or inventory updates) to flow easily between different parts of the app without making the code messy.
* **UI Library:** Under `src/components/ui`, you’ll find our building blocks—buttons, inputs, and cards. Keeping these separate allowed us to maintain a consistent design throughout the entire system.
* **Security Logic:** Our security modules (Login, 2FA, Set Password) are designed as a sequence. We focused on ensuring that even if someone forgets a password, there is a clear, secure path to recover it.

## How to Set Up the Project

To run this project locally, you will need [Node.js](https://nodejs.org/) installed on your computer.

1. **Clone the repository:**
```bash
git clone https://github.com/your-username/em-cayetano-store-management-system.git

```


2. **Install dependencies:**
```bash
npm install

```


3. **Set up environment variables:**
Create a `.env` file in the root directory and add your PostgreSQL connection details (refer to the documentation for required keys).
4. **Run the development server:**
```bash
npm run dev

```


5. Open your browser to the local address provided in your terminal (usually `http://localhost:5173`).

## Reflections and Future Improvements

This project was a significant learning experience for our team. We learned how to manage a full-stack environment and the importance of "clean code" when multiple people are working on the same repository.

**Current Limitations:**

* The system is currently optimized for desktop use; mobile responsiveness is still a work in progress.
* The backend integration for real-time alerts is in the early stages.

**Future Goals:**

* Adding a barcode scanning feature for faster inventory entry.
* Implementing an automated email notification system for low-stock alerts.

---

*Created by the E.M. Cayetano Trading System Proponents - T.I.P. Quezon City (2025)*
