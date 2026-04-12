import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // 👈 ADDED: This brings back your dark mode UI!
import { AuthProvider } from "react-oidc-context";

const cognitoAuthConfig = {
  // 1. The Authority Link (From User Pool Overview)
  authority: "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_9i2bj72lI", 
  
  // 2. The Client ID (The 26-character string from App Client)
  client_id: "59ikrfsg77nelipd3ccmf22hvf", 
  
  // 3. The Redirect URI / Domain Link (Where Google sends you back)
  redirect_uri: "https://gilded-tiramisu-bd1128.netlify.app/", 
  
  response_type: "code",
  
  // 👈 FIXED: Swapped "phone" for "profile" to match your new AWS settings!
  scope: "email openid profile", 
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)