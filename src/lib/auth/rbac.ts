type RoleRecord = {
  role: {
    name: string;
    permissions: {
      permission: {
        key: string;
      };
    }[];
  };
};

export type PermissionUser = {
  roles: RoleRecord[];
};

export function hasRole(user: PermissionUser, roleName: string) {
  return user.roles.some((item) => item.role.name === roleName);
}

export function hasPermission(user: PermissionUser, permissionKey: string) {
  return user.roles.some((item) =>
    item.role.permissions.some((permission) => permission.permission.key === permissionKey)
  );
}

