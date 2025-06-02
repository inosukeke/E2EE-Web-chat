import { Container, Nav, Navbar, Stack } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import Notification from "./chat/Notification";

const MyNavBar = () => {
  const { user, logoutUser, privateKey } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = async (e) => {
    e.preventDefault();
    try {
      await logoutUser();
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 100);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Navbar bg="dark" className="mb-4" style={{ height: "3.75rem" }}>
      <Container>
        <h2>
          <Link to="/" className="link-light text-decoration-none">
            ChatApp
          </Link>
        </h2>
        {user && privateKey && (
          <span className="text-warning">Logged in as {user?.name}</span>
        )}
        <Nav>
          <Stack direction="horizontal" gap={3}>
            {user && privateKey && (
              <>
                <Notification />
                <Link
                  onClick={handleLogout}
                  to="/login"
                  className="link-light text-decoration-none"
                >
                  Logout
                </Link>
              </>
            )}

            {(!user || !privateKey) && (
              <>
                <Link to="/login" className="link-light text-decoration-none">
                  Login
                </Link>
                <Link
                  to="/register"
                  className="link-light text-decoration-none"
                >
                  Register
                </Link>
              </>
            )}
          </Stack>
        </Nav>
      </Container>
    </Navbar>
  );
};

export default MyNavBar;
