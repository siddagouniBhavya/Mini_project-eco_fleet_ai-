# 🚢 EcoFleet AI – Intelligent Maritime Fleet Optimization System

**EcoFleet AI** is an AI-powered maritime fleet optimization platform designed to improve fuel efficiency, reduce greenhouse gas (GHG) emissions, minimize operational costs, and optimize voyage planning.

The system combines Machine Learning-based fuel consumption prediction with Quantum-Inspired Genetic Algorithms (QIGA) and Genetic Algorithms (GA) to generate optimized vessel allocation and voyage plans.

Unlike conventional route optimization systems that primarily focus on finding the shortest route, EcoFleet AI considers multiple operational factors, including fuel consumption, emissions, transportation cost, voyage duration, vessel capacity, cargo requirements, and operational constraints.

## 🚀 Project Overview

The primary objective of EcoFleet AI is to support intelligent maritime transportation by helping fleet operators make data-driven decisions.

The platform evaluates different vessel allocation possibilities and identifies efficient voyage plans by balancing operational performance and environmental sustainability.

## ✨ Key Features

1. **Fuel Consumption Prediction:** Uses a Machine Learning model to predict vessel fuel consumption based on relevant operational parameters.
2. **Intelligent Voyage Planning:** Helps generate optimized voyage plans based on shipment requirements and vessel availability.
3. **Quantum-Inspired Genetic Algorithm (QIGA):** Applies quantum-inspired optimization techniques to explore potential fleet allocation solutions.
4. **Genetic Algorithm (GA):** Uses evolutionary optimization to improve candidate solutions.
5. **Multi-Objective Optimization:** Considers fuel consumption, GHG emissions, operational cost, and voyage time.
6. **Fleet Management:** Supports vessel and fleet information management.
7. **Shipment Management:** Manages shipment details and transportation requirements.
8. **Vessel Allocation:** Evaluates vessel suitability and cargo allocation while considering capacity constraints.
9. **Voyage Management:** Supports voyage creation, planning, and allocation management.
10. **Sustainability Analysis:** Evaluates environmental and operational performance through optimization results.

## 🧠 Machine Learning Approach

EcoFleet AI incorporates Machine Learning to estimate vessel fuel consumption.

- **Dataset:** FuelCast dataset.
- **Model Selection:** Histogram-Based Gradient Boosting Regressor.
- **Prediction Target:** `Consumer_Total_MomentaryFuel`.
- **Purpose:** Estimate fuel consumption to support voyage planning and fleet optimization.

The predicted fuel consumption is used as an important input when evaluating candidate voyage plans.

## ⚛️ Optimization Algorithms

EcoFleet AI integrates two optimization approaches:

### 1. Quantum-Inspired Genetic Algorithm (QIGA)

QIGA uses quantum-inspired representations and evolutionary operations to explore possible solutions to fleet allocation problems.

It helps explore different combinations of vessel assignments and identify promising optimization candidates.

### 2. Genetic Algorithm (GA)

GA uses evolutionary principles such as selection, crossover, and mutation to improve candidate solutions over successive generations.

### 3. Multi-Objective Optimization

The optimization process considers four major performance objectives:

| Objective        | Weight |
| ---------------- | -----: |
| Fuel Consumption |    40% |
| GHG Emissions    |    25% |
| Operational Cost |    20% |
| Voyage Time      |    15% |

The objective weights represent the project's Green Score configuration.

The optimization process aims to balance these objectives while satisfying vessel capacity and shipment requirements.

## 🛠️ Technology Stack

| Category          | Technologies            |
| ----------------- | ----------------------- |
| Frontend          | Next.js                 |
| Backend           | Python, FastAPI         |
| Machine Learning  | Scikit-learn            |
| Optimization      | QIGA, Genetic Algorithm |
| Database          | PostgreSQL              |
| Data Processing   | Pandas, NumPy           |
| Model Storage     | Joblib                  |
| API Communication | REST APIs               |

## 🏗️ System Architecture

EcoFleet AI follows a modular architecture consisting of the following components:

**1. Frontend Layer**

- Provides the user interface for fleet management, shipment management, and voyage planning.
- Displays optimization results and operational analytics.

**2. Backend Layer**

- Built using FastAPI.
- Handles business logic, API requests, data processing, and optimization workflows.

**3. Machine Learning Layer**

- Predicts vessel fuel consumption using the trained Histogram-Based Gradient Boosting model.

**4. Optimization Layer**

- Integrates QIGA and GA to explore and improve vessel allocation solutions.
- Evaluates candidate solutions using fuel, emissions, cost, and time objectives.

**5. Database Layer**

- PostgreSQL stores structured application data, including operational records and management information.

## 🔄 How EcoFleet AI Works

1. Fleet operators manage vessel information.
2. Shipment details and transportation requirements are provided.
3. The system evaluates vessel availability and capacity constraints.
4. The Machine Learning model predicts fuel consumption.
5. QIGA and GA explore possible vessel allocation solutions.
6. Candidate solutions are evaluated against operational and sustainability objectives.
7. The system generates optimized voyage planning results.
8. Users can review vessel allocations and relevant performance metrics.

## 📂 Project Structure

The project is organized into frontend and backend modules.

```text
EcoFleet-AI/
│
├── backend/
│   ├── app/
│   ├── models/
│   ├── services/
│   ├── routes/
│   ├── optimization/
│   ├── data/
│   └── main.py
│
├── eco_frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── README.md
└── requirements.txt
```

*Note: This is a representative structure. Update directory names according to the actual repository.*

## ⚙️ Installation and Setup

### Prerequisites

- Python 3.10+
- Node.js and npm
- PostgreSQL

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd eco-fleet-ai
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

**Windows:**

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Configure the required environment variables, including database connection details and authentication settings.

Start the FastAPI server:

```bash
uvicorn main:app --reload
```

### 3. Frontend Setup

Open another terminal:

```bash
cd eco_frontend
npm install
npm run dev
```

Configure the frontend API URL to point to the running backend.

### 4. Access the Application

Open the frontend development URL displayed in your terminal.

FastAPI interactive API documentation is generally available at:

```text
http://localhost:8000/docs
```

## 🎯 Project Objectives

- Improve maritime fleet operational efficiency.
- Reduce fuel consumption and greenhouse gas emissions.
- Optimize vessel allocation for shipment requirements.
- Apply Machine Learning to fuel consumption prediction.
- Explore quantum-inspired optimization techniques for complex fleet planning problems.
- Support sustainable and cost-effective maritime transportation.

## 🔮 Future Enhancements

- Real-time weather, wind, and wave condition integration.
- Dynamic voyage optimization using live maritime data.
- Advanced predictive analytics.
- Enhanced fleet performance monitoring.
- Improved multi-objective optimization strategies.

## 👩‍💻 Developer

**Bhavya Goud**

- GitHub: [siddagouniBhavya](https://github.com/siddagouniBhavya)
- LinkedIn: [Bhavya Goud](https://linkedin.com/in/bhavya-goud-bab975353)

---

⭐ If you find this project interesting, consider giving the repository a star!

