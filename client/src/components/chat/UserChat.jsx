import { Stack } from "react-bootstrap";
import { useFetchRecipientUser } from "../../hooks/useFectchRecipient";
import avatar from "../../assets/avatar.svg";
import { useContext } from "react";
import { ChatContext } from "../../context/ChatContext";

const UserChat = ({ chat, user }) => {
  const { onlineUsers } = useContext(ChatContext);
  const { recipientUser, loading, error } = useFetchRecipientUser(chat, user);
  if (loading) return <div>Loading...</div>;
  if (error || !recipientUser) return <div>Error or no recipient found</div>;

  console.log("UserChat - recipientUser:", recipientUser);

  const isOnline = onlineUsers?.some(
    (user) => user?.userId === recipientUser?._id
  );

  return (
    <Stack
      direction="horizontal"
      gap={3}
      className="user-card align-items-center p-2 justify-content-between"
      role="button"
    >
      <div className="d-flex">
        <div className="me-2">
          <img src={avatar} height="35px" />
        </div>
        <div className="text-content">
          <div className="name"> {recipientUser?.name}</div>
          <div className="text">Text Messages</div>
        </div>
      </div>
      <div className="d-flex flex-column align-items-end">
        <div className="date">1/1/2011</div>
        <div className="this-user-notifications">0</div>
        <span className={isOnline ? "user-online" : ""}></span>
      </div>
    </Stack>
  );
};

export default UserChat;
