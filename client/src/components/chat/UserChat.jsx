import { Stack } from "react-bootstrap";
import { useFetchRecipientUser } from "../../hooks/useFectchRecipient";
import avatar from "../../assets/avatar.svg";
import { useContext } from "react";
import { ChatContext } from "../../context/ChatContext";
import { unreadNotificationsFunction } from "../../utils/unreadNotifications";
const UserChat = ({ chat, user }) => {
  const { onlineUsers, notifications, markThisUserNotificationAsRead } =
    useContext(ChatContext);
  const { recipientUser, loading, error } = useFetchRecipientUser(chat, user);
  const unreadNotifications = unreadNotificationsFunction(notifications);
  const thisUserNotifications = unreadNotifications.filter(
    (notification) => notification.senderId === recipientUser?._id
  );
  if (loading) return <div>Loading...</div>;
  if (error || !recipientUser) return <div>Error or no recipient found</div>;

  const isOnline = onlineUsers?.some(
    (user) => user?.userId === recipientUser?._id
  );

  return (
    <Stack
      direction="horizontal"
      gap={3}
      className="user-card align-items-center p-2 justify-content-between"
      role="button"
      onClick={() => {
        if (thisUserNotifications.length > 0) {
          markThisUserNotificationAsRead(thisUserNotifications, notifications);
        }
      }}
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
        <div className="date">7/6/2025</div>
        <div
          className={
            thisUserNotifications.length > 0 ? "this-user-notifications" : ""
          }
        >
          {thisUserNotifications.length > 0 ? thisUserNotifications.length : ""}
        </div>
        <span className={isOnline ? "user-online" : ""}></span>{" "}
        {/* online status */}
      </div>
    </Stack>
  );
};

export default UserChat;
