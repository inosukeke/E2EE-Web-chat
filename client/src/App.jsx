import { Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import "bootstrap/dist/css/bootstrap.min.css";
import { Container } from "react-bootstrap";
import MyNavBar from "./components/NavBar";
import { useContext } from "react";
import { AuthContext } from "./context/AuthContext";
import { ChatContextProvider } from "./context/ChatContext";

function App() {
  const { user, privateKey } = useContext(AuthContext);

  return (
    <ChatContextProvider user={user} privateKey={privateKey}>
      <MyNavBar />
      <Container>
        <Routes>
          <Route path="/" element={user && privateKey ? <Chat /> : <Login />} />
          <Route
            path="/register"
            element={user && privateKey ? <Chat /> : <Register />}
          />
          <Route
            path="/login"
            element={user && privateKey ? <Chat /> : <Login />}
          />
          <Route path="/*" element={<Navigate to="/" />} />
        </Routes>
      </Container>
    </ChatContextProvider>
  );
}

export default App;
