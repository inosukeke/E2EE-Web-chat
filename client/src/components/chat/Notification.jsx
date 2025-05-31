import { useContext, useState } from "react";
import { ChatContext } from "../../context/ChatContext";
import { AuthContext } from "../../context/AuthContext";
import { unreadNotificationsFunction } from "../../utils/unreadNotifications";
import moment from "moment";
const Notification = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useContext(AuthContext);
  const {
    notifications,
    userChats,
    allUsers,
    markAllNotificationsAsRead,
    markNotificationAsRead,
  } = useContext(ChatContext);
  const unreadNotifications = unreadNotificationsFunction(notifications);
  const modifiedNotifications = notifications.map((notification) => {
    const sender = allUsers.find((user) => user._id === notification.senderId);
    return {
      ...notification,
      senderName: sender?.name,
    };
  });
  return (
    <div className="notifications">
      <div className="notifications-icon" onClick={() => setIsOpen(!isOpen)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          fill="currentColor"
          className="bi bi-chat-left-fill"
          viewBox="0 0 16 16"
        >
          <path d="M2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z" />
        </svg>
        {unreadNotifications.length > 0 && (
          <span className="notification-count">
            <span>{unreadNotifications.length}</span>
          </span>
        )}
      </div>
      {isOpen ? (
        <div className="notification-box">
          <div className="notification-header">
            <h3>Notifications</h3>
            <div className="mark-as-read" onClick={markAllNotificationsAsRead}>
              Mark all as read
            </div>
          </div>
          {modifiedNotifications.length === 0 ? (
            <span className="notification">No notification</span>
          ) : null}
          {modifiedNotifications.length > 0 &&
            modifiedNotifications.map((notification, index) => (
              <div
                className={
                  notification.isRead ? "notification" : "notification not-read"
                }
                key={index}
                onClick={() => {
                  markNotificationAsRead(
                    notification,
                    userChats,
                    user,
                    notifications
                  );
                  setIsOpen(false);
                }}
              >
                <span>{`${notification.senderName} sent you a message`}</span>
                <span className="notification-time">
                  {moment(notification.date).calendar()}
                </span>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
};

export default Notification;
