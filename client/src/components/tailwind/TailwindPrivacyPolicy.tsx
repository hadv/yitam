import React from 'react';

const TailwindPrivacyPolicy: React.FC = () => {
  return (
    <div className="p-6 bg-white rounded-lg shadow-sm max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-[#3A2E22] mb-6">Chính sách quyền riêng tư</h2>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">1. Giới thiệu</h3>
        <p className="text-gray-700 mb-3">
          Chính sách quyền riêng tư này giải thích cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn khi bạn sử dụng ứng dụng Yitam của chúng tôi.
        </p>
        <p className="text-gray-700">
          Chúng tôi cam kết bảo vệ quyền riêng tư của bạn và tuân thủ các quy định của GDPR (Quy định bảo vệ dữ liệu chung của EU) và các luật bảo vệ dữ liệu hiện hành.
        </p>
      </section>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">2. Dữ liệu được thu thập</h3>
        <p className="text-gray-700 mb-3">
          Yitam thu thập và lưu trữ các loại dữ liệu sau đây:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-2">
          <li><strong>Dữ liệu tài khoản:</strong> Địa chỉ email được sử dụng để xác thực thông qua Google.</li>
          <li><strong>Lịch sử trò chuyện:</strong> Nội dung các cuộc hội thoại của bạn với trợ lý AI.</li>
          <li><strong>Cài đặt người dùng:</strong> Tùy chọn và cài đặt trong ứng dụng.</li>
          <li><strong>Khóa API:</strong> Khóa API của bạn (được mã hóa cục bộ) nếu bạn cung cấp.</li>
        </ul>
      </section>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">3. Lưu trữ dữ liệu</h3>
        <p className="text-gray-700 mb-3">
          <strong>Lưu trữ cục bộ:</strong> Tất cả dữ liệu trò chuyện và cài đặt của bạn được lưu trữ cục bộ trong trình duyệt của bạn, sử dụng IndexedDB.
        </p>
        <p className="text-gray-700 mb-3">
          <strong>Không lưu trữ trên máy chủ:</strong> Yitam không lưu trữ nội dung trò chuyện của bạn trên máy chủ của chúng tôi.
        </p>
        <p className="text-gray-700">
          <strong>Xử lý API:</strong> Khi bạn gửi tin nhắn, nội dung được gửi đến nhà cung cấp API AI để xử lý. Việc xử lý này tuân theo chính sách quyền riêng tư của nhà cung cấp API.
        </p>
      </section>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">4. Quyền của bạn theo GDPR</h3>
        <p className="text-gray-700 mb-3">
          Theo GDPR, bạn có các quyền sau đối với dữ liệu của mình:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-2">
          <li><strong>Quyền truy cập:</strong> Bạn có quyền truy cập dữ liệu của mình thông qua tính năng xuất dữ liệu.</li>
          <li><strong>Quyền sửa đổi:</strong> Bạn có thể chỉnh sửa thông tin cá nhân của mình trong cài đặt hồ sơ.</li>
          <li><strong>Quyền xóa:</strong> Bạn có thể xóa tất cả dữ liệu của mình từ cài đặt quyền riêng tư.</li>
          <li><strong>Quyền di chuyển dữ liệu:</strong> Bạn có thể xuất dữ liệu của mình dưới dạng tệp JSON.</li>
          <li><strong>Quyền giới hạn xử lý:</strong> Bạn có thể kiểm soát việc xử lý dữ liệu của mình bằng cách điều chỉnh cài đặt lưu trữ.</li>
        </ul>
      </section>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">5. Bảo mật dữ liệu</h3>
        <p className="text-gray-700 mb-3">
          Chúng tôi thực hiện các biện pháp bảo mật sau đây để bảo vệ dữ liệu của bạn:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-2">
          <li>Mã hóa khóa API được lưu trữ cục bộ</li>
          <li>Sử dụng HTTPS cho tất cả các giao tiếp</li>
          <li>Xác thực người dùng an toàn thông qua Google OAuth</li>
          <li>Lưu trữ dữ liệu cục bộ để giảm thiểu rủi ro</li>
        </ul>
      </section>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">6. Thời gian lưu trữ dữ liệu</h3>
        <p className="text-gray-700 mb-3">
          Dữ liệu của bạn được lưu trữ cho đến khi:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-2">
          <li>Bạn quyết định xóa dữ liệu của mình</li>
          <li>Bạn xóa trình duyệt của mình, xóa bộ nhớ cache hoặc dữ liệu IndexedDB</li>
          <li>Dữ liệu được tự động xóa dựa trên chính sách lưu trữ mà bạn đã cấu hình</li>
        </ul>
      </section>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">7. Chia sẻ dữ liệu</h3>
        <p className="text-gray-700 mb-3">
          Chúng tôi không chia sẻ dữ liệu của bạn với bên thứ ba, ngoại trừ:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-2">
          <li>Với nhà cung cấp API AI khi bạn gửi tin nhắn để xử lý</li>
          <li>Với Google cho mục đích xác thực (chỉ email của bạn)</li>
          <li>Khi có yêu cầu pháp lý buộc chúng tôi phải làm như vậy</li>
        </ul>
      </section>
      
      <section className="mb-6">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-3">8. Liên hệ</h3>
        <p className="text-gray-700">
          Nếu bạn có bất kỳ câu hỏi nào về chính sách quyền riêng tư của chúng tôi hoặc muốn thực hiện quyền GDPR của mình, vui lòng liên hệ với chúng tôi qua email: <a href="mailto:privacy@yitam.com" className="text-[#78A161] hover:underline">privacy@yitam.com</a>
        </p>
      </section>
      
      <div className="mt-8 text-sm text-gray-500">
        <p>Cập nhật lần cuối: Ngày 25 tháng 5 năm 2025</p>
      </div>
    </div>
  );
};

export default TailwindPrivacyPolicy; 