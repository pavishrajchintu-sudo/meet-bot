import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from "react-oidc-context";

// 🛑 THIS IS WHERE YOUR 3 KEYS GO 🛑
const cognitoAuthConfig = {
  // 1. The Authority Link (From User Pool Overview)
  authority: "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_9i2bj72lI/.well-known/jwks.json", 
  
  // 2. The Client ID (The 26-character string from App Client)
  client_id: "59ikrfsg77nelipd3ccmf22hvf", 
  
  // 3. The Redirect URI / Domain Link (Where Google sends you back)
  redirect_uri: "https://gilded-tiramisu-bd1128.netlify.app/", // Change to your Netlify URL when deploying
  
  response_type: "code",
  scope: "phone openid email",
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)