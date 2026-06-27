import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './assets/index.css' // <-- Make sure this line looks exactly like this!

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)