import { useEffect, useState } from "react";
import { baseUrl, getRequest } from "../utils/services";

export const useFetchRecipientUser = (chat, user) => {
  const [recipientUser, setRecipientUser] = useState(null);
  const [error, setError] = useState(null);

  const recipientId = chat?.members?.find((id) => id !== user?._id); //find user except this.user

  useEffect(() => {
    const getUser = async () => {
      if (!recipientId) return null;
      const response = await getRequest(`${baseUrl}/users/find/${recipientId}`);

      if (!response) {
        return setError({ error: "No response from server" });
      }
      if (response.error) {
        return setError(response);
      }

      setRecipientUser(response);
    };
    getUser();
  }, [recipientId]);
  return { recipientUser };
};
