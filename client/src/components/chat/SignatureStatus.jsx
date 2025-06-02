import React from "react";
import { AiFillCheckCircle, AiFillCloseCircle } from "react-icons/ai";

const SignatureStatus = ({ isValid }) => {
  return (
    <span
      className={`ms-2 ${isValid ? "text-success" : "text-danger"}`}
      title={isValid ? "Chữ ký hợp lệ" : "Chữ ký không hợp lệ hoặc không có"}
    >
      {isValid ? (
        <AiFillCheckCircle size={16} />
      ) : (
        <AiFillCloseCircle size={16} />
      )}
    </span>
  );
};

export default SignatureStatus;
